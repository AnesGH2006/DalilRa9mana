@echo off
chcp 65001 > nul
title وكيل مدير المتوسطة — جارٍ التشغيل

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      SchoolManager Desktop Agent         ║
echo  ╚══════════════════════════════════════════╝
echo.

python agent.py %*

if errorlevel 1 (
    echo.
    echo  [!] توقف الوكيل بسبب خطأ. راجع الرسائل أعلاه.
    pause
)
