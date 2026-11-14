@echo off
chcp 65001 > nul
title إعداد وكيل مدير المتوسطة

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   SchoolManager Desktop Agent — Setup    ║
echo  ╚══════════════════════════════════════════╝
echo.

REM Check Python
python --version > nul 2>&1
if errorlevel 1 (
    echo  [!] Python غير مثبّت على هذا الجهاز.
    echo      قم بتنزيله من: https://www.python.org/downloads/
    echo      تأكد من تفعيل خيار "Add Python to PATH" عند التثبيت.
    pause
    exit /b 1
)

echo  [1/3] تثبيت المكتبات المطلوبة...
pip install -r requirements.txt --quiet

if errorlevel 1 (
    echo.
    echo  [!] فشل تثبيت بعض المكتبات. تحقق من اتصال الإنترنت وأعد المحاولة.
    pause
    exit /b 1
)

echo  [2/3] إنشاء ملف الإعدادات...

if not exist agent_config.json (
    echo { > agent_config.json
    echo   "serverUrl": "", >> agent_config.json
    echo   "token": "" >> agent_config.json
    echo } >> agent_config.json
    echo      تم إنشاء agent_config.json — افتحه وأضف رابط الخادم والرمز.
) else (
    echo      ملف agent_config.json موجود مسبقاً.
)

echo  [3/3] اكتمل الإعداد.
echo.
echo  ══════════════════════════════════════════════
echo   الخطوات التالية:
echo   1. افتح agent_config.json وأضف:
echo      - serverUrl: رابط منصتك (من صفحة الوكيل في المتصفح)
echo      - token:     الرمز الذي أنشأته من لوحة التحكم
echo   2. شغّل الوكيل بنقر مزدوج على start_windows.bat
echo  ══════════════════════════════════════════════
echo.
pause
