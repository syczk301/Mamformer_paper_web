"""
自动加载data目录中的数据集到数据库
"""
import os
import sys
import pandas as pd

# Add api directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.models import DataFile, User

def load_datasets():
    """Load datasets from data directory into database"""
    db = SessionLocal()
    try:
        # Get the first user (admin or user 123)
        user = db.query(User).first()
        if not user:
            print("No user found in database. Please create a user first.")
            return
        
        # Path to data directory (relative to project root)
        data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
        
        if not os.path.exists(data_dir):
            print(f"Data directory not found: {data_dir}")
            return
        
        print(f"Loading datasets from: {data_dir}")
        
        # Process each CSV file
        for filename in os.listdir(data_dir):
            if not filename.endswith('.csv'):
                continue
            
            file_path = os.path.join(data_dir, filename)
            
            # Check if already exists
            existing = db.query(DataFile).filter(
                DataFile.user_id == user.id,
                DataFile.filename == filename
            ).first()
            
            if existing:
                print(f"[OK] {filename} - already loaded")
                continue
            
            try:
                # Read CSV to get metadata
                df = pd.read_csv(file_path)
                rows, columns = df.shape
                
                # Get column info
                column_info = []
                for col in df.columns:
                    dtype = str(df[col].dtype)
                    missing = int(df[col].isnull().sum())
                    column_info.append({
                        "name": col,
                        "type": dtype,
                        "missing": missing
                    })
                
                # Create DataFile record
                data_file = DataFile(
                    user_id=user.id,
                    filename=filename,
                    file_path=file_path,
                    rows=rows,
                    columns=columns,
                    column_info=column_info
                )
                
                db.add(data_file)
                db.commit()
                
                print(f"[OK] {filename} - loaded ({rows} rows, {columns} columns)")
                
            except Exception as e:
                print(f"[ERROR] {filename} - error: {e}")
                db.rollback()
                continue
        
        print("\nDataset loading complete!")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    load_datasets()
