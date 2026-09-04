@echo off
echo ============================================
echo  清理 Electron 打包产物（release / release2）
echo ============================================
echo.

set CLEANED=1

if exist "%~dp0release" (
    rmdir /s /q "%~dp0release"
    if exist "%~dp0release" (
        echo [失败] release 仍有文件被占用。
        set CLEANED=0
    ) else (
        echo [成功] release 已清理。
    )
) else (
    echo release 不存在，跳过。
)

if exist "%~dp0release2" (
    rmdir /s /q "%~dp0release2"
    if exist "%~dp0release2" (
        echo [失败] release2 仍有文件被占用。
        set CLEANED=0
    ) else (
        echo [成功] release2 已清理。
    )
) else (
    echo release2 不存在，跳过。
)

echo.
if "%CLEANED%"=="0" (
    echo 提示：有文件被占用，重启电脑后再运行本脚本最稳妥。
) else (
    echo 全部清理完成！
)

echo.
pause
