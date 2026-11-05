@echo off
REM Lance loutil donboarding : double-cliquez sur ce fichier.
cd /d "%~dp0"
if not exist .venv (
  echo Premiere installation, patientez une minute...
  py -3 -m venv .venv || (echo Python est introuvable. Installez-le depuis python.org puis relancez. & pause & exit /b 1)
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput >nul
echo.
echo Outil lance sur http://127.0.0.1:8765  -  fermez cette fenetre pour larreter.
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8765/"
python -m waitress --listen=127.0.0.1:8765 cabinet.wsgi:application
