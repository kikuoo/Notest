# Notest ローカル実行ガイド (Mac 版)

Notest を自身の Mac で実行することで、Excel や Word などのファイルをデスクトップアプリで直接開けるようになります。

## 1. 準備物
- **Python**: [python.org](https://www.python.org/) から最新版をインストールしてください。
- **ターミナル**: Mac 標準のアプリです（アプリケーション > ユーティリティ内）。

## 2. 実行手順

1. **フォルダへ移動**: ターミナルを開き、Notest のソースコードがあるディレクトリに移動します。
   ```bash
   cd /path/to/Notest
   ```

2. **仮想環境の作成と有効化**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **ライブラリのインストール**:
   ```bash
   pip install -r requirements.txt
   ```

4. **起動**:
   ```bash
   python app.py
   ```

5. **ブラウザでアクセス**:
   起動後、ブラウザで [http://localhost:5001](http://localhost:5001) を開きます。

## 3. 設定
- 画面下の「設定」から、「ストレージ設定」で Mac 内の任意のフォルダパス（例: `/Users/あなたのユーザ名/Documents`）を指定してください。
- これで、Notest 上の「開く」ボタンから、Mac 内のアプリが直接起動するようになります。
