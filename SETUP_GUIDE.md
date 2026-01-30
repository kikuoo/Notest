# WowNote セットアップガイド

## セットアップ手順

### 1. 仮想環境と依存関係のインストール（完了済み）

既に以下のコマンドで完了しています：
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. MySQLのパスワード設定

`.env`ファイルを開いて、MySQLのパスワードを設定してください：

```bash
# エディタで.envファイルを開く
nano .env
# または
vim .env
# または
open -e .env  # macOS
```

`.env`ファイルの`MYSQL_PASSWORD=`の部分に、あなたのMySQLのパスワードを設定してください：

```env
MYSQL_PASSWORD=your_mysql_password
```

**MySQLのパスワードがわからない場合：**

1. MySQLのパスワードをリセットする
2. または、MySQLに新しいユーザーを作成する：
   ```sql
   CREATE USER 'notest_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON notest_db.* TO 'notest_user'@'localhost';
   FLUSH PRIVILEGES;
   ```
   その後、`.env`ファイルで：
   ```env
   MYSQL_USER=notest_user
   MYSQL_PASSWORD=your_password
   ```

### 3. データベースの作成

`.env`ファイルでパスワードを設定した後、以下のコマンドを実行：

```bash
source venv/bin/activate
python setup_db.py
```

### 4. アプリケーションの起動

```bash
source venv/bin/activate
python app.py
```

ブラウザで `http://localhost:5000` にアクセスしてください。

## トラブルシューティング

### MySQL接続エラー

**エラー: Access denied for user 'root'@'localhost'**

- `.env`ファイルの`MYSQL_PASSWORD`が正しく設定されているか確認
- MySQLが起動しているか確認：`mysql.server status` または `brew services list` (Homebrew使用時)
- MySQLのパスワードを確認：`mysql -u root -p` で接続できるかテスト

### ポートが既に使用されている

**エラー: Address already in use**

- 別のポートを使用するか、既存のプロセスを終了
- `app.py`の最後の行を変更：`app.run(debug=True, host='0.0.0.0', port=5001)`

### データベースが作成できない

- MySQLのユーザーに適切な権限があるか確認
- データベース名が既に使用されていないか確認
