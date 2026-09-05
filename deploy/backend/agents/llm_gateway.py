"""
llm_gateway.py —— LLM 网关（OpenAI 兼容协议，纯标准库，零依赖）。

配置（环境变量）：
    AGENT_LLM_BASE_URL  服务地址，如 https://api.deepseek.com/v1
    AGENT_LLM_API_KEY   API Key
    AGENT_LLM_MODEL     模型名，默认 deepseek-chat

兼容 DeepSeek / Qwen / GLM / vLLM / Ollama 等任何 OpenAI 兼容端点。
未配置时 chat() 抛出 LLMError，由 AgentBrain 回退 RuleBrain（对局永不卡死）。
"""
import json
import os
import urllib.request
import urllib.error


class LLMError(Exception):
    """LLM 调用失败（未配置 / 网络 / 超时 / 服务端错误）。"""


def _config():
    base = os.environ.get('AGENT_LLM_BASE_URL', '').rstrip('/')
    key = os.environ.get('AGENT_LLM_API_KEY', '')
    model = os.environ.get('AGENT_LLM_MODEL', 'deepseek-chat')
    if not base or not key:
        raise LLMError('未配置 LLM（需环境变量 AGENT_LLM_BASE_URL / AGENT_LLM_API_KEY）')
    return base, key, model


def chat(messages: list, temperature: float = 0.0, max_tokens: int = 1200,
         timeout: int = 45, response_format: dict = None) -> str:
    """一次 chat completion，返回助手文本。失败抛 LLMError。

    response_format: 如 {'type': 'json_object'} 强制 JSON 输出（OpenAI 兼容，
    DeepSeek/Qwen/vLLM 均支持）——配合提示词中的 JSON 输出约定使用，
    从根上消除"推理文字过长截断 JSON"的问题。
    """
    base, key, model = _config()
    url = base + '/chat/completions'
    payload = {
        'model': model,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': max_tokens,
        'stream': False,
    }
    if response_format:
        payload['response_format'] = response_format
    body = json.dumps(payload).encode('utf-8')

    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {key}',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise LLMError(f'LLM HTTP {e.code}: {e.read().decode("utf-8", "ignore")[:200]}')
    except Exception as e:
        raise LLMError(f'LLM 调用失败: {e}')

    try:
        return data['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError):
        raise LLMError(f'LLM 响应格式异常: {str(data)[:200]}')
