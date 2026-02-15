"""
ユーザー認証テーブルを作成するマイグレーションスクリプト
"""
from dotenv import load_dotenv
load_dotenv()

from app import db, User, EmailVerificationToken
import sys

def create_auth_tables():
    """認証関連のテーブルを作成"""
    from app import app
    
    try:
        print("認証テーブルを作成しています...")
        
        with app.app_context():
            # テーブルを作成
            db.create_all()
        
        print("✓ usersテーブルを作成しました")
        print("✓ email_verification_tokensテーブルを作成しました")
        print("\n認証テーブルの作成が完了しました！")
        
        return True
    except Exception as e:
        print(f"エラー: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    if create_auth_tables():
        sys.exit(0)
    else:
        sys.exit(1)
