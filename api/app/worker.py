import os
from celery import Celery
from app.core.config import settings
from app.services.trainer import train_model_task
from app.core.database import SessionLocal
from app.models.models import TrainingTask, TrainingResult, TrainingLog
from datetime import datetime
import json
import uuid

celery = Celery(__name__)
celery.conf.broker_url = settings.CELERY_BROKER_URL
celery.conf.result_backend = settings.CELERY_RESULT_BACKEND
celery.conf.task_always_eager = settings.CELERY_TASK_ALWAYS_EAGER

@celery.task(bind=True)
def train_mamformer_task(self, task_id_db: str, file_path: str, target_col: str, config: dict):
    run_training_logic(task_id_db, file_path, target_col, config, celery_task=self)

import math

def sanitize_for_json(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj

def run_training_logic(task_id_db: str, file_path: str, target_col: str, config: dict, celery_task=None):
    db = SessionLocal()
    try:
        # Cast string ID to UUID object for SQLAlchemy/SQLite compatibility
        task_uuid = uuid.UUID(task_id_db)
        task = db.query(TrainingTask).filter(TrainingTask.id == task_uuid).first()
        
        if not task:
            print(f"Task {task_id_db} not found in DB")
            return "Task not found"
            
        task.status = "running"
        task.started_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        print(f"Error initializing task: {e}")
        db.close()
        return f"Error initializing task: {e}"
    
    def progress_callback(tid, progress, epoch, train_loss, val_r2, metrics=None):
        if celery_task:
            celery_task.update_state(state='PROGRESS', meta={
                'progress': progress,
                'epoch': epoch,
                'train_loss': train_loss,
                'val_r2': val_r2,
                'metrics': metrics
            })
        # Log to DB
        try:
            log_metrics = metrics if metrics else {"val_r2": val_r2}
            log = TrainingLog(
                task_id=task_uuid, # Use UUID object
                epoch=epoch,
                train_loss=train_loss,
                val_loss=metrics.get('val_loss') if metrics else None, 
                metrics=sanitize_for_json(log_metrics)
            )
            db.add(log)
            db.commit()
        except Exception as e:
            print(f"Error logging progress: {e}")

    try:
        result_data = train_model_task(
            file_path=file_path,
            target_col=target_col,
            config=config,
            task_id=task_id_db,
            update_progress_callback=progress_callback
        )
        
        # Save result
        # Sanitize data to ensure valid JSON (no NaNs/Infs)
        sanitized_metrics = sanitize_for_json(result_data['metrics'])
        sanitized_preds = sanitize_for_json(result_data['predictions'])
        sanitized_true = sanitize_for_json(result_data['true_values'])
        
        training_result = TrainingResult(
            task_id=task_uuid, # Use UUID object
            r2_score=sanitize_for_json(result_data['r2_score']) or 0.0,
            rmse=sanitize_for_json(result_data['rmse']) or 0.0,
            mae=sanitize_for_json(result_data['mae']) or 0.0,
            mape=sanitize_for_json(result_data['mape']) or 0.0,
            metrics=sanitized_metrics,
            model_path=result_data['model_path'],
            predictions={
                "preds": sanitized_preds,
                "true": sanitized_true
            }
        )
        db.add(training_result)
        
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        db.commit()
        
        return "训练已完成"
        
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        task.completed_at = datetime.utcnow()
        db.commit()
        # Do not raise exception if running in background task to avoid crashing the worker/process
        # But for Celery it's good to raise.
        if celery_task:
            raise e
        print(f"Training failed: {e}")
    finally:
        db.close()
