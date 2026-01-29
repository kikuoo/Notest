#!/usr/bin/env python3
"""
MySQL接続テストスクリプト
接続情報を確認し、問題を診断します
"""
import os
import sys
from dotenv import load_dotenv
import pymysql

# 環境変数の読み込み
load_dotenv()

def test_connection():
    """MySQL接続をテスト"""
    host = os.getenv('MYSQL_HOST', 'localhost')
    port = int(os.getenv('MYSQL_PORT', 3306))
    user = os.getenv('MYSQL_USER', 'root')
    password = os.getenv('MYSQL_PASSWORD', '')
    database = os.getenv('MYSQL_DATABASE', 'notest_db')
    
    print("=" * 60)
    print("MySQL接続テスト")
    print("=" * 60)
    print(f"ホスト: {host}")
    print(f"ポート: {port}")
    print(f"ユーザー: {user}")
    print(f"パスワード: {'***' if password else '(未設定)'}")
    print(f"データベース: {database}")
    print("=" * 60)
    print()
    
    # テスト1: パスワードなしで接続
    print("テスト1: パスワードなしで接続を試みます...")
    try:
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password='',
            charset='utf8mb4'
        )
        print("✓ パスワードなしで接続成功！")
        connection.close()
        return True
    except pymysql.Error as e:
        print(f"✗ パスワードなしでは接続できません: {e}")
    
    # テスト2: 設定されたパスワードで接続
    if password:
        print(f"\nテスト2: 設定されたパスワードで接続を試みます...")
        try:
            connection = pymysql.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                charset='utf8mb4'
            )
            print("✓ 設定されたパスワードで接続成功！")
            connection.close()
            return True
        except pymysql.Error as e:
            print(f"✗ 設定されたパスワードでは接続できません: {e}")
            print(f"  エラーコード: {e.args[0]}")
            print(f"  エラーメッセージ: {e.args[1]}")
    
    # テスト3: 別のユーザーを試す
    print(f"\nテスト3: 他のユーザーを試します...")
    test_users = ['root', 'admin', 'mysql']
    for test_user in test_users:
        if test_user == user:
            continue
        try:
            connection = pymysql.connect(
                host=host,
                port=port,
                user=test_user,
                password=password if password else '',
                charset='utf8mb4'
            )
            print(f"✓ ユーザー '{test_user}' で接続成功！")
            print(f"  .envファイルのMYSQL_USERを '{test_user}' に変更してください。")
            connection.close()
            return True
        except pymysql.Error:
            pass
    
    print("\n" + "=" * 60)
    print("接続に失敗しました。以下の点を確認してください：")
    print("=" * 60)
    print("1. MySQLが起動しているか確認:")
    print("   brew services list  # Homebrew使用時")
    print("   mysql.server status")
    print()
    print("2. パスワードを確認:")
    print("   mysql -u root -p  # 対話的に接続を試す")
    print()
    print("3. MySQLのrootユーザーのパスワードをリセット:")
    print("   sudo mysql -u root")
    print("   ALTER USER 'root'@'localhost' IDENTIFIED BY '新しいパスワード';")
    print()
    print("4. 新しいユーザーを作成:")
    print("   CREATE USER 'notest_user'@'localhost' IDENTIFIED BY 'パスワード';")
    print("   GRANT ALL PRIVILEGES ON *.* TO 'notest_user'@'localhost';")
    print("   FLUSH PRIVILEGES;")
    print()
    print("5. .envファイルで新しいユーザーを使用:")
    print("   MYSQL_USER=notest_user")
    print("   MYSQL_PASSWORD=パスワード")
    print("=" * 60)
    
    return False

if __name__ == '__main__':
    if test_connection():
        print("\n✓ 接続テスト成功！データベースの作成に進めます。")
        sys.exit(0)
    else:
        print("\n✗ 接続テスト失敗。上記の手順を確認してください。")
        sys.exit(1)
