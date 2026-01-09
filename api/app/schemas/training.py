from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class TrainingConfig(BaseModel):
    target_col: str
    seq_len: int = 12
    d_model: int = 64
    n_layers: int = 2
    dropout: float = 0.3
    lr: float = 0.001
    batch_size: int = 32
    epochs: int = 400
    top_k: int = 12
    n_models: int = 5

class TrainingTaskCreate(BaseModel):
    data_id: UUID
    config: TrainingConfig
    model_type: str = "mamformer"  # 模型类型：mamformer, auto-mamformer

class TrainingTaskBase(BaseModel):
    id: UUID
    user_id: UUID
    data_id: UUID
    status: str
    config: Dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True

class TrainingTask(TrainingTaskBase):
    pass

class TrainingResultBase(BaseModel):
    r2_score: float
    rmse: float
    mae: float
    mape: float
    metrics: Dict[str, Any]
    model_path: str
    predictions: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class TrainingResult(TrainingResultBase):
    id: UUID
    task_id: UUID
    created_at: datetime
