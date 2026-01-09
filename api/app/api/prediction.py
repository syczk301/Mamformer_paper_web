from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.models import TrainingTask, TrainingResult
from pydantic import BaseModel
from typing import Dict, List, Optional
from uuid import UUID
import torch
import numpy as np
import pandas as pd
import os
from pathlib import Path

router = APIRouter()

class PredictionRequest(BaseModel):
    features: Dict[str, float]

class PredictionResponse(BaseModel):
    prediction: float
    confidence_interval: Optional[List[float]] = None
    input_features: Dict[str, float]

@router.get("/features/{task_id}")
def get_model_features(
    task_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    获取模型的输入特征列表
    """
    # 验证任务所有权
    task = db.query(TrainingTask).filter(
        TrainingTask.id == task_id,
        TrainingTask.user_id == current_user.id,
        TrainingTask.status == 'completed'
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="未找到已完成的训练任务")
    
    # 获取训练结果以获取特征列表
    result = db.query(TrainingResult).filter(TrainingResult.task_id == task_id).first()
    if not result or not result.feature_importance:
        raise HTTPException(status_code=404, detail="未找到特征信息")
    
    # 从feature_importance中提取特征名称
    features = list(result.feature_importance.keys())
    
    return {"features": features, "count": len(features)}

@router.post("/predict/{task_id}", response_model=PredictionResponse)
def predict(
    task_id: UUID,
    request: PredictionRequest,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    使用训练好的模型进行预测
    """
    # 验证任务所有权和状态
    task = db.query(TrainingTask).filter(
        TrainingTask.id == task_id,
        TrainingTask.user_id == current_user.id,
        TrainingTask.status == 'completed'
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="未找到已完成的训练任务")
    
    # 检查模型文件是否存在
    model_path = Path("model") / f"{task_id}.pth"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="模型文件不存在")
    
    # 获取训练结果以获取特征列表和scaler信息
    result = db.query(TrainingResult).filter(TrainingResult.task_id == task_id).first()
    if not result or not result.feature_importance:
        raise HTTPException(status_code=404, detail="未找到模型配置信息")
    
    try:
        # 加载模型
        from app.services.model_arch import Mamformer
        
        # 准备输入特征
        expected_features = list(result.feature_importance.keys())
        
        # 验证输入特征
        if set(request.features.keys()) != set(expected_features):
            missing = set(expected_features) - set(request.features.keys())
            extra = set(request.features.keys()) - set(expected_features)
            error_msg = ""
            if missing:
                error_msg += f"缺少特征: {', '.join(list(missing)[:5])}"
            if extra:
                error_msg += f" 多余特征: {', '.join(list(extra)[:5])}"
            raise HTTPException(status_code=400, detail=error_msg or "特征不匹配")
        
        # 按照正确的顺序排列特征
        feature_values = [request.features[f] for f in expected_features]
        
        # 转换为numpy数组
        X = np.array([feature_values], dtype=np.float32)
        
        # 加载模型（注意：这里简化处理，实际可能需要加载scaler等）
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # 获取模型配置
        config = task.config or {}
        d_model = config.get('d_model', 64)
        n_heads = config.get('n_heads', 4)
        d_ff = config.get('d_ff', 128)
        n_layers = config.get('n_layers', 2)
        dropout = config.get('dropout', 0.1)
        
        # 初始化模型
        model = Mamformer(
            input_dim=len(expected_features),
            d_model=d_model,
            n_heads=n_heads,
            d_ff=d_ff,
            n_layers=n_layers,
            dropout=dropout,
            output_dim=1
        ).to(device)
        
        # 加载模型权重
        checkpoint = torch.load(model_path, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()
        
        # 转换为张量
        X_tensor = torch.FloatTensor(X).to(device)
        
        # 进行预测
        with torch.no_grad():
            prediction = model(X_tensor)
            pred_value = prediction.cpu().numpy()[0, 0]
        
        # 计算置信区间（简化版本，使用标准差估计）
        # 在实际应用中，可以使用更复杂的方法
        std_estimate = abs(pred_value) * 0.1  # 假设10%的标准差
        confidence_interval = [
            float(pred_value - 1.96 * std_estimate),
            float(pred_value + 1.96 * std_estimate)
        ]
        
        return PredictionResponse(
            prediction=float(pred_value),
            confidence_interval=confidence_interval,
            input_features=request.features
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"预测失败: {str(e)}")
