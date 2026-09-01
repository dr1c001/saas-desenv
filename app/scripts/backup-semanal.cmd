@echo off
REM Backup semanal do ServicoOS — feito para a Tarefa Agendada do Windows.
REM
REM Faz as DUAS coisas, e nesta ordem: gera o backup e PROVA que ele restaura.
REM Backup que ninguem provou e so um arquivo grande com esperanca dentro.
REM
REM Registrar (uma vez, num Prompt de Comando):
REM   schtasks /create /tn "ServicoOS Backup" /tr "\"%~f0\"" /sc weekly /d SUN /st 09:00

cd /d "%~dp0.."
call npm run backup >> backups\_ultima-execucao.log 2>&1
if errorlevel 1 (
  echo [%date% %time%] BACKUP FALHOU >> backups\_ultima-execucao.log
  exit /b 1
)

REM A pasta mais recente e a que acabou de ser criada.
for /f "delims=" %%d in ('dir /b /ad /o-d backups 2^>nul') do (
  call npm run backup:provar -- "backups\%%d" >> backups\_ultima-execucao.log 2>&1
  if errorlevel 1 (
    echo [%date% %time%] BACKUP NAO PROVA — VERIFIQUE >> backups\_ultima-execucao.log
    exit /b 1
  )
  echo [%date% %time%] ok: %%d >> backups\_ultima-execucao.log
  goto :fim
)
:fim
