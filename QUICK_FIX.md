# MySQL接続問題のクイック修正

現在、MySQLへの接続に失敗しています。以下のいずれかの方法で解決できます。

## 方法1: パスワードを確認して修正（推奨）

1. ターミナルで以下のコマンドを実行してMySQLに接続を試みます：
   ```bash
   mysql -u root -p
   ```
   パスワードを入力して接続できるか確認してください。

2. 接続できない場合、またはパスワードが違う場合：
   ```bash
   sudo mysql -u root
   ```
   これで接続できる場合、パスワード認証が無効になっている可能性があります。

3. パスワードを設定/変更：
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'kikuoo100907';
   FLUSH PRIVILEGES;
   exit;
   ```

4. 再度接続テスト：
   ```bash
   mysql -u root -p
   # パスワード: kikuoo100907
   ```

## 方法2: 新しいユーザーを作成

1. sudoでMySQLに接続：
   ```bash
   sudo mysql -u root
   ```

2. 新しいユーザーを作成：
   ```sql
   CREATE USER 'notest_user'@'localhost' IDENTIFIED BY 'kikuoo100907';
   GRANT ALL PRIVILEGES ON *.* TO 'notest_user'@'localhost';
   FLUSH PRIVILEGES;
   exit;
   ```

3. `.env`ファイルを編集：
   ```env
   MYSQL_USER=notest_user
   MYSQL_PASSWORD=kikuoo100907
   ```

4. 接続テスト：
   ```bash
   source venv/bin/activate
   python test_mysql_connection.py
   ```

## 方法3: パスワードなしで接続（セキュリティ上非推奨）

もしsudo mysqlで接続できる場合、認証プラグインを変更できます：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'kikuoo100907';
FLUSH PRIVILEGES;
```

## 接続確認後

接続が成功したら、以下を実行：

```bash
source venv/bin/activate
python setup_db.py
```

データベースが作成されたら：

```bash
python app.py
```

ブラウザで `http://localhost:5000` にアクセスしてください。
