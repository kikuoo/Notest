#!/usr/bin/env python3
"""
データベースセットアップスクリプト
MySQLデータベースとテーブルを作成します
"""
import os
import sys
from dotenv import load_dotenv
import pymysql

# 環境変数の読み込み
load_dotenv()

def create_database():
    """データベースを作成"""
    host = os.getenv('MYSQL_HOST', 'localhost')
    port = int(os.getenv('MYSQL_PORT', 3306))
    user = os.getenv('MYSQL_USER', 'root')
    password = os.getenv('MYSQL_PASSWORD', '')
    database = os.getenv('MYSQL_DATABASE', 'notest_db')
    
    try:
        # データベース作成のため、まずはデータベース名を指定せずに接続
        # MySQL 8.0以降の認証プラグインに対応
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            charset='utf8mb4',
            connect_timeout=10,
            autocommit=True
        )
        
        with connection.cursor() as cursor:
            # データベースが存在するか確認
            cursor.execute(f"SHOW DATABASES LIKE '{database}'")
            result = cursor.fetchone()
            
            if result:
                print(f"データベース '{database}' は既に存在します。")
                response = input("削除して再作成しますか？ (y/N): ")
                if response.lower() == 'y':
                    cursor.execute(f"DROP DATABASE {database}")
                    print(f"データベース '{database}' を削除しました。")
                else:
                    print("既存のデータベースを使用します。")
                    connection.close()
                    return True
            
            # データベースを作成
            cursor.execute(f"CREATE DATABASE {database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            print(f"データベース '{database}' を作成しました。")
        
        connection.close()
        return True
        
    except pymysql.Error as e:
        print(f"エラーが発生しました: {e}")
        print("\n接続情報を確認してください:")
        print(f"  ホスト: {host}")
        print(f"  ポート: {port}")
        print(f"  ユーザー: {user}")
        print(f"  パスワード: {'設定済み' if password else '未設定'}")
        return False

if __name__ == '__main__':
    print("=" * 50)
    print("WowNote データベースセットアップ")
    print("=" * 50)
    print()
    
    if create_database():
        print("\nデータベースの作成が完了しました。")
        print("次に 'python app.py' を実行してアプリケーションを起動してください。")
        print("アプリケーション起動時にテーブルが自動的に作成されます。")
    else:
        print("\nデータベースの作成に失敗しました。")
        print(".envファイルの設定を確認してください。")
        sys.exit(1)
