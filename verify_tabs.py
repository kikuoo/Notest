from app import app, db, Tab, Page

with app.app_context():
    tabs = Tab.query.all()
    print(f"Total Tabs: {len(tabs)}")
    for tab in tabs:
        print(f"Tab: {tab.id} - {tab.name}")
        for page in tab.pages:
            print(f"  Page: {page.id} - {page.name}")

    if len(tabs) == 0:
        print("Creating a test tab...")
        new_tab = Tab(name="Test Tab")
        db.session.add(new_tab)
        db.session.commit()
        print(f"Created Tab: {new_tab.id} - {new_tab.name}")
