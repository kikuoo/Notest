@echo off
echo ------------------------------------------------
echo   WowNote Desktop Windows ビルドスクリプト
echo ------------------------------------------------

:: Pythonの確認
where python >nul 2>1
if %errorlevel% neq 0 (
    echo エラー: Python がインストールされていないか、PATHが通っていません。
    exit /b 1
)

:: 必要なライブラリのインストール
echo -> ライブラリをインストールしています...
pip install pywebview pyinstaller

:: ビルドの実行
:: --noconsole: 黒い画面（コマンドプロンプト）を出さない
:: --onefile: 1つのEXEにまとめる（起動は少し遅くなるが配布しやすい）
:: ここでは --windowed を使用
echo -> パッケージを作成しています...
pyinstaller --noconfirm --windowed --name "WowNote" ^
    --hidden-import webview.platforms.winforms ^
    desktop_app.py

echo ------------------------------------------------
echo   ビルドが完了しました！
echo   dist/WowNote.exe を配布してください。
echo ------------------------------------------------
pause
