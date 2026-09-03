@echo off
chcp 65001 >nul
echo ============================================
echo  清理旧版打包产物（无图标版本 release）
echo ============================================
echo.

if not exist "%~dp0release" (
    echo 旧版 release 目录不存在，无需清理。
    goto end
)

rmdir /s /q "%~dp0release"

if exist "%~dp0release" (
    echo [失败] 仍有文件被占用，请关闭相关程序后重试。
    echo （提示：重启电脑后再运行本脚本最稳妥）
) else (
    echo [成功] 旧版 release 已清理。
)

:end
echo.
pause
