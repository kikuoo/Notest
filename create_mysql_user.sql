-- Notest用のMySQLユーザーを作成するSQLスクリプト
-- 使用方法: sudo mysql -u root < create_mysql_user.sql
-- または: sudo mysql -u root で接続後、このファイルの内容を実行

-- 既存のユーザーを削除（存在する場合）
DROP USER IF EXISTS 'notest_user'@'localhost';

-- 新しいユーザーを作成
CREATE USER 'notest_user'@'localhost' IDENTIFIED BY 'kikuoo100907';

-- すべての権限を付与
GRANT ALL PRIVILEGES ON *.* TO 'notest_user'@'localhost';

-- 権限を反映
FLUSH PRIVILEGES;

-- 確認
SELECT User, Host FROM mysql.user WHERE User = 'notest_user';
