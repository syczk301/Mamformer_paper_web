from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.api import deps
from app.models.models import TrainingTask, DataFile, TrainingResult, TrainingLog
from app.schemas.training import TrainingTaskCreate, TrainingTask as TrainingTaskSchema, TrainingResult as TrainingResultSchema
from app.worker import train_mamformer_task, run_training_logic
from app.core.config import settings
from uuid import UUID
from pydantic import BaseModel
from typing import Dict

router = APIRouter()

class DirectTrainingCreate(BaseModel):
    file_path: str
    filename: str
    config: Dict

@router.post("/create", response_model=TrainingTaskSchema)
def create_training_task(
    task_in: TrainingTaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    # 调试日志
    print(f"=" * 50)
    print(f"收到训练请求:")
    print(f"  model_type: {task_in.model_type}")
    print(f"  data_id: {task_in.data_id}")
    print(f"  config: {task_in.config}")
    print(f"=" * 50)
    
    data_file = db.query(DataFile).filter(DataFile.id == task_in.data_id, DataFile.user_id == current_user.id).first()
    if not data_file:
        raise HTTPException(status_code=404, detail="未找到数据文件")
        
    # 将模型类型加入配置中
    config_dict = task_in.config.dict()
    config_dict['model_type'] = task_in.model_type
    print(f"  config_dict (with model_type): {config_dict}")
    
    task = TrainingTask(
        user_id=current_user.id,
        data_id=task_in.data_id,
        config=config_dict,
        status="pending"
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # Start task
    if settings.CELERY_TASK_ALWAYS_EAGER:
        # If eager (no Redis/Broker), use FastAPI BackgroundTasks to avoid blocking the response
        background_tasks.add_task(
            run_training_logic,
            str(task.id),
            data_file.file_path,
            task_in.config.target_col,
            config_dict
        )
    else:
        # Use Celery
        train_mamformer_task.delay(
            str(task.id),
            data_file.file_path,
            task_in.config.target_col,
            config_dict
        )
    
    return task

@router.delete("/{task_id}")
def delete_training_task(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    Delete a training task and all its associated data (logs, results, model files)
    """
    import os
    
    # Verify task ownership
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id, TrainingTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="未找到训练任务")
    
    # Delete associated logs
    db.query(TrainingLog).filter(TrainingLog.task_id == task_id).delete()
    
    # Delete associated results
    result = db.query(TrainingResult).filter(TrainingResult.task_id == task_id).first()
    if result:
        db.delete(result)
    
    # Delete model file if exists
    model_path = f"model/{task_id}.pth"
    if os.path.exists(model_path):
        try:
            os.remove(model_path)
        except Exception as e:
            print(f"Failed to delete model file: {e}")
    
    # Delete the task
    db.delete(task)
    db.commit()
    
    return {"message": "训练任务已删除", "task_id": str(task_id)}

@router.get("/{task_id}", response_model=TrainingTaskSchema)
def get_training_task(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id, TrainingTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="未找到训练任务")
    return task

@router.get("/", response_model=list[TrainingTaskSchema])
def get_training_tasks(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    tasks = db.query(TrainingTask).filter(TrainingTask.user_id == current_user.id).order_by(TrainingTask.created_at.desc()).offset(skip).limit(limit).all()
    return tasks

@router.get("/{task_id}/progress")
def get_training_progress(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id, TrainingTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="未找到训练任务")
        
    # Get latest log
    latest_log = db.query(TrainingLog).filter(TrainingLog.task_id == task_id).order_by(TrainingLog.epoch.desc()).first()
    
    progress = 0
    if task.status == 'completed':
        progress = 100
    elif task.status == 'pending':
        progress = 0
    elif latest_log:
        # Estimate progress based on epochs
        total_epochs = task.config.get('epochs', 400) * task.config.get('n_models', 5)
        # This is rough because we don't store absolute epoch in log easily without calculation
        # But in worker we store "overall_progress" in Celery meta.
        # Here we just use what we have. 
        # Actually, let's just return the latest log info.
        pass
    
    # Ideally we should check Celery state here for real-time, but for now let's return latest log
    return {
        "status": task.status,
        "latest_log": latest_log,
        "started_at": task.started_at,
        "completed_at": task.completed_at
    }

@router.get("/{task_id}/result", response_model=TrainingResultSchema)
def get_training_result(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    # Verify task ownership
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id, TrainingTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="未找到训练任务")
        
    result = db.query(TrainingResult).filter(TrainingResult.task_id == task_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="未找到训练结果")
    return result

@router.get("/{task_id}/logs")
def get_training_logs(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    task = db.query(TrainingTask).filter(TrainingTask.id == task_id, TrainingTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="未找到训练任务")
        
    logs = db.query(TrainingLog).filter(TrainingLog.task_id == task_id).order_by(TrainingLog.epoch).all()
    return logs

@router.post("/create-direct", response_model=TrainingTaskSchema)
def create_training_task_direct(
    task_in: DirectTrainingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    Create training task directly from a file path (auto-loaded datasets)
    """
    import os
    if not os.path.exists(task_in.file_path):
        raise HTTPException(status_code=404, detail=f"文件不存在: {task_in.file_path}")
    
    # Create a DataFile record (optional, for tracking)
    data_file = db.query(DataFile).filter(
        DataFile.user_id == current_user.id,
        DataFile.file_path == task_in.file_path
    ).first()
    
    if not data_file:
        # Create new data file record
        import pandas as pd
        df = pd.read_csv(task_in.file_path)
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
        
        data_file = DataFile(
            user_id=current_user.id,
            filename=task_in.filename,
            file_path=task_in.file_path,
            rows=rows,
            columns=columns,
            column_info=column_info
        )
        db.add(data_file)
        db.commit()
        db.refresh(data_file)
    
    # Create training task
    task = TrainingTask(
        user_id=current_user.id,
        data_id=data_file.id,
        config=task_in.config,
        status="pending"
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # Start task
    if settings.CELERY_TASK_ALWAYS_EAGER:
        background_tasks.add_task(
            run_training_logic,
            str(task.id),
            task_in.file_path,
            task_in.config['target_col'],
            task_in.config
        )
    else:
        train_mamformer_task.delay(
            str(task.id),
            task_in.file_path,
            task_in.config['target_col'],
            task_in.config
        )
    
    return task
