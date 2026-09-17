"""
train_v1.py —— QLoRA 微调 Qwen2.5-3B（阶段一：纯动作行为克隆）

适配硬件：RTX 4060 Laptop 8GB 显存
- 4bit NF4 量化 + LoRA(r=16) + 梯度检查点：峰值显存 ~6GB
- 546 条样本 × 3 epochs，约 1~2 小时

环境准备（首次运行前执行一次）：
    pip install torch --index-url https://download.pytorch.org/whl/cu121
    pip install transformers peft accelerate bitsandbytes datasets

模型下载（国内镜像）：
    HF_ENDPOINT=https://hf-mirror.com 自动生效

用法：
    python -m agents.train_v1            # 训练 + 保存 adapter
    python -m agents.train_v1 --merge    # 训练完成后合并为完整模型
"""
import argparse
import json
import os

MODEL_ID = 'Qwen/Qwen2.5-3B-Instruct'
DATA_PATH = 'data/sft/v1_action_train.jsonl'
# 产物一律放 D 盘（C 盘仅剩 40G，checkpoint+合并模型共约 7G）
OUT_DIR = r'D:/work/gamemake/models/qwen-3b-v1'
MAX_LEN = 4096  # 默认值；云端 32GB 显存可用 --max-len 8192 解锁完整上下文


def load_ds(path=DATA_PATH):
    from datasets import Dataset
    rows = []
    for line in open(path, encoding='utf-8'):
        r = json.loads(line)
        msgs = r['messages']
        text = ''
        for m in msgs:
            role = m['role']
            content = m['content']
            if role == 'system':
                text += f'<|im_start|>system\n{content}<|im_end|>\n'
            elif role == 'user':
                text += f'<|im_start|>user\n{content}<|im_end|>\n'
            else:
                text += f'<|im_start|>assistant\n{content}<|im_end|>\n'
        rows.append({'text': text})
    ds = Dataset.from_list(rows)
    print(f'训练样本: {len(ds)} 条')
    return ds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--merge', action='store_true', help='训练后合并 adapter 为完整模型')
    ap.add_argument('--epochs', type=float, default=3.0)
    ap.add_argument('--lr', type=float, default=2e-4)
    ap.add_argument('--test', action='store_true', help='只跑 8 条样本冒烟验证')
    ap.add_argument('--resume', action='store_true', help='从最新 checkpoint 续训')
    ap.add_argument('--max-len', type=int, default=MAX_LEN,
                    help=f'上下文截断长度（默认 {MAX_LEN}；云端大显存可 6144/8192 完整容纳）')
    ap.add_argument('--model', default=MODEL_ID, help=f'底座模型（默认 {MODEL_ID}）')
    ap.add_argument('--data', default=DATA_PATH, help='训练数据 jsonl（默认 v1 纯动作集）')
    ap.add_argument('--out', default=OUT_DIR, help='输出目录')
    ap.add_argument('--no-4bit', action='store_true',
                    help='不用 bitsandbytes 4bit（bnb 与 torch 不兼容时用 bf16 全精度 LoRA）')
    ap.add_argument('--batch', type=int, default=2, help='per-device batch（大模型用 1）')
    args = ap.parse_args()

    # 训练期间阻止系统休眠（Windows 专用 API；Linux 跳过）
    if os.name == 'nt':
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(
            0x80000002)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

    import torch
    from transformers import (
        AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig,
        TrainingArguments, Trainer, DataCollatorForLanguageModeling,
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    assert torch.cuda.is_available(), 'CUDA 不可用，请先修复 GPU 驱动'

    print(f'GPU: {torch.cuda.get_device_name(0)} / 显存 {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB')
    print(f'模型: {args.model}')

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type='nf4',
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    load_kwargs = {}
    if args.no_4bit:
        load_kwargs = {'torch_dtype': torch.bfloat16}
        print('模式：bf16 全精度 LoRA（未用 4bit）')
    else:
        load_kwargs = {'quantization_config': bnb}
    model = AutoModelForCausalLM.from_pretrained(
        args.model, device_map='auto', trust_remote_code=True, **load_kwargs)
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj',
                        'gate_proj', 'up_proj', 'down_proj'],
        bias='none', task_type='CAUSAL_LM',
    )
    model = get_peft_model(model, lora)
    # 显式开启梯度检查点：无论 bnb 是否生效，都压住 8192 长序列的激活显存
    model.gradient_checkpointing_enable()
    if hasattr(model.config, 'use_cache'):
        model.config.use_cache = False
    model.print_trainable_parameters()

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    # 左截断：超长时砍掉开头的系统提示词，保住末尾的 assistant 答案
    tokenizer.truncation_side = 'left'

    ds = load_ds(args.data)
    if args.test:
        ds = ds.select(range(8))

    def tokenize(ex):
        out = tokenizer(ex['text'], truncation=True, padding='max_length',
                        max_length=args.max_len)
        out['labels'] = out['input_ids'].copy()
        return out

    ds = ds.map(tokenize, remove_columns=['text'])

    train_args = TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=8,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy='epoch',
        bf16=True,
        gradient_checkpointing=True,
        torch_compile=False,  # transformers 5.x 可能默认开启编译，首步显存爆炸，显式关掉
        optim='paged_adamw_8bit',
        report_to='none',
    )
    trainer = Trainer(
        model=model,
        args=train_args,
        train_dataset=ds,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )
    # 自动续训：从最新 checkpoint 恢复（机器意外重启后无需从头训练）
    resume_from = None
    if args.resume:
        import glob
        ckpts = sorted(glob.glob(f'{args.out}/checkpoint-*'),
                       key=lambda p: int(p.rsplit('-', 1)[1]))
        if ckpts:
            resume_from = ckpts[-1]
            print(f'从 checkpoint 续训: {resume_from}')
    trainer.train(resume_from_checkpoint=resume_from)
    model.save_pretrained(f'{args.out}/adapter')
    tokenizer.save_pretrained(f'{args.out}/adapter')
    print(f'训练完成，adapter 已保存: {args.out}/adapter')

    if args.merge:
        from peft import PeftModel
        base = AutoModelForCausalLM.from_pretrained(
            args.model, torch_dtype=torch.bfloat16, device_map='auto',
            trust_remote_code=True)
        merged = PeftModel.from_pretrained(base, f'{args.out}/adapter')
        merged = merged.merge_and_unload()
        merged.save_pretrained(f'{args.out}/merged')
        tokenizer.save_pretrained(f'{args.out}/merged')
        print(f'合并模型已保存: {args.out}/merged')


if __name__ == '__main__':
    main()
