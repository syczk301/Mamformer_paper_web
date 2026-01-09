import os
import shutil
import pandas as pd
import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.models import DataFile, User
from app.schemas.data import DataFile as DataFileSchema
from uuid import uuid4

router = APIRouter()

UPLOAD_DIR = "uploads"
# Auto-load directory - navigate from api/app/api/data.py to project root
# __file__ = api/app/api/data.py
# dirname(__file__) = api/app/api
# dirname(dirname(__file__)) = api/app
# dirname(dirname(dirname(__file__))) = api
# dirname(dirname(dirname(dirname(__file__)))) = project root
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=DataFileSchema)
async def upload_data(
    file: UploadFile = File(...),
    description: str = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="仅支持 CSV 文件")
    
    file_id = str(uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_filename = f"{file_id}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Analyze file
        df = pd.read_csv(file_path)
        rows, columns = df.shape
        
        column_info = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            missing = int(df[col].isnull().sum())
            column_info.append({
                "name": col,
                "type": dtype,
                "missing": missing
            })
            
        preview = df.head(10).to_dict(orient='records')
        
        data_file = DataFile(
            user_id=current_user.id,
            filename=file.filename,
            file_path=file_path,
            rows=rows,
            columns=columns,
            column_info=column_info
        )
        
        db.add(data_file)
        db.commit()
        db.refresh(data_file)
        
        # Attach preview to response (not stored in DB main table, maybe should be but it's fine)
        # Pydantic model has 'preview' field, SQLAlchemy model does not.
        # We can just return a dict or attach it to the object.
        data_file_resp = DataFileSchema.from_orm(data_file)
        data_file_resp.preview = preview
        
        return data_file_resp
        
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"无法处理文件：{str(e)}")

@router.get("/", response_model=list[DataFileSchema])
def get_data_files(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    files = db.query(DataFile).filter(DataFile.user_id == current_user.id).offset(skip).limit(limit).all()
    return files

@router.get("/datasets")
def list_available_datasets(
    current_user: User = Depends(deps.get_current_user)
):
    """
    List all CSV datasets from the data directory
    """
    datasets = []
    
    if not os.path.exists(DATA_DIR):
        return {"datasets": [], "message": "Data directory not found"}
    
    try:
        for filename in os.listdir(DATA_DIR):
            if filename.endswith('.csv'):
                file_path = os.path.join(DATA_DIR, filename)
                try:
                    # Read CSV to get metadata
                    df = pd.read_csv(file_path)
                    rows, columns = df.shape
                    
                    # Get column names and types
                    column_info = []
                    for col in df.columns:
                        dtype = str(df[col].dtype)
                        missing = int(df[col].isnull().sum())
                        column_info.append({
                            "name": col,
                            "type": dtype,
                            "missing": missing
                        })
                    
                    datasets.append({
                        "filename": filename,
                        "file_path": file_path,
                        "rows": rows,
                        "columns": columns,
                        "column_names": df.columns.tolist(),
                        "column_info": column_info,
                        "size": os.path.getsize(file_path)
                    })
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
                    continue
        
        return {"datasets": datasets, "count": len(datasets)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing datasets: {str(e)}")
