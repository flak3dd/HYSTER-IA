@echo off
REM Hysteria 2 Admin Panel - Automated Setup Script for Windows
REM This script helps automate the installation process on Windows

echo ========================================
echo Hysteria 2 Admin Panel - Setup Script
echo ========================================
echo.

REM Function to check if a command exists
:check_command
where %1 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] %1 is installed
    goto :eof
) else (
    echo [ERROR] %1 is not installed
    goto :eof
)

REM Check Node.js
echo Checking Node.js installation...
call :check_command node
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo Node.js version: %NODE_VERSION%

REM Check npm
echo Checking npm installation...
call :check_command npm
if %ERRORLEVEL% NEQ 0 (
    echo npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo npm version: %NPM_VERSION%
echo.

REM Check PostgreSQL
echo Checking PostgreSQL installation...
call :check_command psql
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] PostgreSQL client not found
    echo PostgreSQL is required. Please install PostgreSQL 14+ or use Docker
    echo Docker command: docker run --name hysteria2-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14
    set /p CONTINUE="Continue anyway? (y/n): "
    if /i not "%CONTINUE%"=="y" (
        exit /b 1
    )
) else (
    echo [OK] PostgreSQL client is installed
)
echo.

REM Install dependencies
echo Installing npm dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed successfully
echo.

REM Setup environment file
echo Setting up environment configuration...
if exist .env.local (
    echo [WARNING] .env.local already exists
    set /p OVERWRITE="Overwrite existing .env.local? (y/n): "
    if /i "%OVERWRITE%"=="y" (
        goto copy_env
    ) else (
        echo Keeping existing .env.local
        goto skip_env
    )
)

:copy_env
if exist .env.example (
    copy .env.example .env.local
    echo [OK] Created .env.local from .env.example
    echo [WARNING] Please edit .env.local with your configuration
    echo Required variables: DATABASE_URL
    echo Optional variables: AI provider keys, Hysteria 2 API credentials
) else (
    echo [ERROR] .env.example not found
    pause
    exit /b 1
)

:skip_env
echo.

REM Initialize database
echo Initializing database...
set /p DB_CONFIGURED="Have you configured DATABASE_URL in .env.local? (y/n): "
if /i not "%DB_CONFIGURED%"=="y" (
    echo [WARNING] Please configure DATABASE_URL in .env.local before continuing
    echo Example: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hysteria2?schema=public
    pause
)

call npm run prisma:push
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to push database schema
    echo Please check your DATABASE_URL configuration
    pause
    exit /b 1
)
echo [OK] Database schema pushed successfully

call npm run prisma:generate
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to generate Prisma Client
    pause
    exit /b 1
)
echo [OK] Prisma Client generated successfully
echo.

REM Setup admin user
echo Setting up admin user...
call npm run setup:admin
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to setup admin user
    pause
    exit /b 1
)
echo [OK] Admin user created successfully
echo Default credentials: admin / admin123 (unless customized in .env.local)
echo.

REM Run tests (optional)
set /p RUN_TESTS="Do you want to run the test suite? (y/n): "
if /i "%RUN_TESTS%"=="y" (
    echo Running tests...
    call npm test
    if %ERRORLEVEL% EQU 0 (
        echo [OK] All tests passed
    ) else (
        echo [WARNING] Some tests failed. This might be expected if API keys are not configured.
    )
)
echo.

REM Completion message
echo ========================================
echo [OK] Setup completed successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Edit .env.local with your configuration
echo   2. Start the development server: npm run dev
echo   3. Open http://localhost:3000/login in your browser
echo   4. Login with admin credentials
echo.
echo For detailed installation instructions, see INSTALL.md
echo.

pause