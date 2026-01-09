from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class DataFileBase(BaseModel):
    filename: str
    description: Optional[str] = None

class DataFileCreate(DataFileBase):
    pass

class DataFile(DataFileBase):
    id: UUID
    user_id: UUID
    rows: int
    columns: int
    column_info: List[Dict[str, Any]]
    uploaded_at: datetime
    preview: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True
