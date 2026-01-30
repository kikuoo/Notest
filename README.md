# WowNote - OneNote風ノートアプリ

FlaskとMySQLを使用した、OneNote風のWebアプリケーションです。

## 機能

- **タブ管理**: ブラウザのようにタブでグループを作成
- **ページ管理**: 各タブ内に複数のページを作成
- **セクション（枠）**: 各ページに複数のセクション（枠）を作成し、自由に配置
- **ドラッグアンドドロップ**: ファイルをドラッグアンドドロップでアップロード
- **コンテンツタイプ**: テキスト、ファイル、リンクをサポート
- **ストレージ設定**: ローカルフォルダ、OneDrive、Google Drive、iCloudなどの保存場所を設定可能

## セットアップ

### クイックセットアップ（推奨）

```bash
# セットアップスクリプトを実行
./setup.sh

# .envファイルを編集してMySQLのパスワードを設定
# MYSQL_PASSWORD=your_password

# データベースを作成
python setup_db.py

# アプリケーションを起動
python app.py
```

### 手動セットアップ

#### 1. 必要な環境

- Python 3.8以上
- MySQL 5.7以上
- pip

#### 2. 仮想環境の作成と依存関係のインストール

```bash
# 仮想環境を作成
python3 -m venv venv

# 仮想環境をアクティベート
source venv/bin/activate  # macOS/Linux
# または
venv\Scripts\activate  # Windows

# 依存関係をインストール
pip install -r requirements.txt
```

#### 3. 環境変数の設定

`.env`ファイルを編集して、MySQLの接続情報を設定してください：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password  # ← ここにMySQLのパスワードを設定
MYSQL_DATABASE=notest_db
SECRET_KEY=your_secret_key_here
STORAGE_BASE_PATH=./storage
```

#### 4. データベースの作成

```bash
# セットアップスクリプトを使用（推奨）
python setup_db.py

# または、MySQLに直接接続して作成
mysql -u root -p
CREATE DATABASE notest_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 5. アプリケーションの起動

```bash
# 仮想環境をアクティベート（まだの場合）
source venv/bin/activate

# アプリケーションを起動
python app.py
```

ブラウザで `http://localhost:5000` にアクセスしてください。

## 使用方法

1. **タブの作成**: 左サイドバーの「+ 新しいタブ」ボタンをクリック
2. **ページの作成**: タブを選択後、上部の「+ ページ」ボタンをクリック
3. **セクションの追加**: ページ内の「+ セクション」ボタンをクリック
4. **ファイルのアップロード**: ファイルをセクションにドラッグアンドドロップ
5. **セクションの移動**: セクションのヘッダーをドラッグして移動
6. **ストレージ設定**: 左下の「設定」ボタンから保存場所を設定

## データベース構造

- **tabs**: タブ情報
- **pages**: ページ情報
- **sections**: セクション（枠）情報
- **storage_locations**: ストレージ場所の設定

## 注意事項

- 外部ストレージ（OneDrive、Google Drive、iCloud）への直接アクセスは、各サービスのAPIを使用する必要があります。現在の実装では、パスの設定のみが可能です。
- ファイルのアップロードサイズは最大500MBに設定されています。
- 本番環境では、`SECRET_KEY`を適切に設定してください。
