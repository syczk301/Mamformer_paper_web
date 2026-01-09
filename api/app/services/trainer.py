import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error, mean_absolute_percentage_error
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
import copy
import os
import time
from app.services.model_arch import Mamformer, AutoMamformer

class AugmentedDataset(Dataset):
    """Augmented Dataset"""
    def __init__(self, data, target_idx, seq_len=8, augment=False):
        self.data = data
        self.target_idx = target_idx
        self.seq_len = seq_len
        self.augment = augment
        
        self.sequences = []
        self.targets = []
        
        for i in range(len(data) - seq_len + 1):
            seq = data[i:i+seq_len, :].copy()
            target = data[i+seq_len-1, target_idx]
            seq[:, target_idx] = 0
            self.sequences.append(seq)
            self.targets.append([target])
        
        self.sequences = np.array(self.sequences)
        self.targets = np.array(self.targets)
        
    def __len__(self):
        return len(self.sequences)
    
    def __getitem__(self, idx):
        seq = self.sequences[idx].copy()
        target = self.targets[idx].copy()
        
        if self.augment:
            if np.random.random() < 0.3 and len(self.sequences) > 1:
                rand_idx = np.random.randint(0, len(self.sequences))
                lam = np.random.beta(0.4, 0.4)
                seq = lam * seq + (1 - lam) * self.sequences[rand_idx]
                target = lam * target + (1 - lam) * self.targets[rand_idx]
            if np.random.random() < 0.4:
                scale = np.random.normal(1.0, 0.05)
                seq = seq * scale
            if np.random.random() < 0.5:
                noise = np.random.normal(0, 0.02, seq.shape)
                seq = seq + noise
            if np.random.random() < 0.2:
                mask_len = max(1, self.seq_len // 4)
                start = np.random.randint(0, self.seq_len - mask_len)
                seq[start:start+mask_len, :] = 0
        
        return torch.FloatTensor(seq), torch.FloatTensor(target)

def set_seed(seed=42):
    import random
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.backends.cudnn.deterministic = True

def select_top_features(df, target_col, top_k=20):
    X = df.drop(target_col, axis=1).values
    y = df[target_col].values
    
    rf = RandomForestRegressor(n_estimators=50, random_state=42, n_jobs=-1)
    gb = GradientBoostingRegressor(n_estimators=50, random_state=42)
    
    rf.fit(X, y)
    gb.fit(X, y)
    
    importances = (rf.feature_importances_ + gb.feature_importances_) / 2
    top_indices = np.argsort(importances)[-top_k:][::-1]
    
    feature_names = df.drop(target_col, axis=1).columns.tolist()
    selected_features = [feature_names[i] for i in top_indices]
    
    return df[selected_features + [target_col]].copy()

def train_model_task(
    file_path: str,
    target_col: str,
    config: dict,
    task_id: str,
    update_progress_callback=None
):
    try:
        set_seed(42)
        df = pd.read_csv(file_path)
        
        # Preprocessing
        for col in df.columns:
            if col != target_col:
                q1 = df[col].quantile(0.01)
                q3 = df[col].quantile(0.99)
                df[col] = df[col].clip(q1, q3)
        
        top_k = config.get('top_k', 12)
        df_selected = select_top_features(df, target_col, top_k=top_k)
        
        target_idx = df_selected.columns.tolist().index(target_col)
        data = df_selected.values
        input_dim = df_selected.shape[1]
        
        seq_len = config.get('seq_len', 12)
        test_size = 0.15
        val_ratio = 0.15
        
        total_len = len(data)
        test_size_idx = int(total_len * (1 - test_size))
        
        train_data_raw = data[:test_size_idx]
        test_data_raw = data[test_size_idx - seq_len + 1:]
        
        train_size = int(len(train_data_raw) * (1 - val_ratio))
        train_subset_data = train_data_raw[:train_size]
        val_subset_data = train_data_raw[train_size:]
        
        scaler = RobustScaler()
        scaler.fit(train_subset_data)
        
        train_scaled = scaler.transform(train_subset_data)
        val_scaled = scaler.transform(val_subset_data)
        test_scaled = scaler.transform(test_data_raw)
        
        train_dataset = AugmentedDataset(train_scaled, target_idx, seq_len=seq_len, augment=True)
        val_dataset = AugmentedDataset(val_scaled, target_idx, seq_len=seq_len, augment=False)
        test_dataset = AugmentedDataset(test_scaled, target_idx, seq_len=seq_len, augment=False)
        
        train_loader = DataLoader(train_dataset, batch_size=config.get('batch_size', 32), shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=config.get('batch_size', 32), shuffle=False)
        test_loader = DataLoader(test_dataset, batch_size=config.get('batch_size', 32), shuffle=False)
        
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        n_models = config.get('n_models', 3)
        epochs = config.get('epochs', 100)
        model_type = config.get('model_type', 'mamformer')
        
        # 打印模型类型确认
        print(f"=" * 50)
        print(f"训练配置:")
        print(f"  模型类型: {model_type}")
        print(f"  输入维度: {input_dim}")
        print(f"  序列长度: {seq_len}")
        print(f"  训练轮次: {epochs}")
        print(f"  集成数量: {n_models}")
        print(f"=" * 50)
        
        trained_models = []
        
        for i in range(n_models):
            # 根据模型类型选择不同的模型架构和默认参数
            if model_type == 'auto-mamformer':
                # Auto-Mamformer: Mamba + Autoformer (自相关 + 序列分解) + 门控融合
                # 参考 auto_mamformer_bod.py 的配置
                print(f"  [模型 {i+1}/{n_models}] 使用 Auto-Mamformer 架构")
                model = AutoMamformer(
                    input_dim=input_dim,
                    d_model=config.get('d_model', 64),
                    n_layers=config.get('n_layers', 2),
                    seq_len=seq_len,
                    pred_len=1,
                    dropout=config.get('dropout', 0.05)  # Auto-Mamformer 使用较低的 dropout
                ).to(device)
            else:  # 默认使用 mamformer
                # Mamformer: Mamba + Attention + GatedMLP
                # 参考 train_whiteness.py 的配置
                print(f"  [模型 {i+1}/{n_models}] 使用 Mamformer 架构")
                model = Mamformer(
                    input_dim=input_dim,
                    d_model=config.get('d_model', 64),
                    n_layers=config.get('n_layers', 2),
                    seq_len=seq_len,
                    dropout=config.get('dropout', 0.3)  # Mamformer 使用较高的 dropout 防止过拟合
                ).to(device)
            
            # 打印模型参数量
            total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
            print(f"    参数量: {total_params:,}")
            
            optimizer = torch.optim.AdamW(model.parameters(), lr=config.get('lr', 0.001), weight_decay=0.01)
            criterion = nn.MSELoss()
            
            best_val_r2 = -float('inf')
            best_state = None
            
            for epoch in range(epochs):
                model.train()
                train_loss = 0
                for batch_x, batch_y in train_loader:
                    batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                    optimizer.zero_grad()
                    preds = model(batch_x)
                    loss = criterion(preds.squeeze(), batch_y.squeeze())
                    loss.backward()
                    optimizer.step()
                    train_loss += loss.item()
                
                # Validation
                model.eval()
                val_preds, val_trues = [], []
                val_loss = 0
                with torch.no_grad():
                    for batch_x, batch_y in val_loader:
                        batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                        preds = model(batch_x)
                        loss = criterion(preds.squeeze(), batch_y.squeeze())
                        val_loss += loss.item()
                        val_preds.extend(preds.cpu().numpy().reshape(-1).tolist())
                        val_trues.extend(batch_y.cpu().numpy().reshape(-1).tolist())
                
                # Calculate validation metrics on original scale
                # Inverse transform to original scale for meaningful R2
                val_preds_array = np.array(val_preds)
                val_trues_array = np.array(val_trues)
                
                dummy_pred_val = np.zeros((len(val_preds_array), scaler.n_features_in_))
                dummy_true_val = np.zeros((len(val_trues_array), scaler.n_features_in_))
                dummy_pred_val[:, target_idx] = val_preds_array
                dummy_true_val[:, target_idx] = val_trues_array
                
                val_preds_rescaled = scaler.inverse_transform(dummy_pred_val)[:, target_idx]
                val_trues_rescaled = scaler.inverse_transform(dummy_true_val)[:, target_idx]
                
                val_r2 = r2_score(val_trues_rescaled, val_preds_rescaled)
                val_mae = mean_absolute_error(val_trues_rescaled, val_preds_rescaled)
                val_rmse = np.sqrt(mean_squared_error(val_trues_rescaled, val_preds_rescaled))
                val_mape = mean_absolute_percentage_error(val_trues_rescaled, val_preds_rescaled) * 100
                avg_val_loss = val_loss / len(val_loader)
                
                if val_r2 > best_val_r2:
                    best_val_r2 = val_r2
                    best_state = copy.deepcopy(model.state_dict())
                
                # Update progress with all metrics
                if update_progress_callback and i == 0 and epoch % 5 == 0:
                    overall_progress = ((i * epochs) + epoch) / (n_models * epochs) * 100
                    metrics = {
                        'val_r2': val_r2,
                        'val_mae': val_mae,
                        'val_rmse': val_rmse,
                        'val_mape': val_mape,
                        'val_loss': avg_val_loss
                    }
                    update_progress_callback(
                        task_id, 
                        overall_progress, 
                        epoch, 
                        train_loss / len(train_loader), 
                        val_r2,
                        metrics
                    )
            
            model.load_state_dict(best_state)
            trained_models.append(model)
        
        # Evaluation
        all_preds = []
        true_values = []
        
        with torch.no_grad():
            for batch_x, batch_y in test_loader:
                true_values.extend(batch_y.numpy().reshape(-1).tolist())
        
        for model in trained_models:
            model.eval()
            model_preds = []
            with torch.no_grad():
                for batch_x, _ in test_loader:
                    batch_x = batch_x.to(device)
                    preds = model(batch_x)
                    model_preds.extend(preds.cpu().numpy().reshape(-1).tolist())
            all_preds.append(np.array(model_preds))
            
        ensemble_preds = np.mean(all_preds, axis=0)
        
        # Inverse Transform
        dummy_pred = np.zeros((len(ensemble_preds), scaler.n_features_in_))
        dummy_true = np.zeros((len(true_values), scaler.n_features_in_))
        dummy_pred[:, target_idx] = ensemble_preds
        dummy_true[:, target_idx] = true_values
        
        preds_rescaled = scaler.inverse_transform(dummy_pred)[:, target_idx]
        trues_rescaled = scaler.inverse_transform(dummy_true)[:, target_idx]
        
        r2 = r2_score(trues_rescaled, preds_rescaled)
        rmse = np.sqrt(mean_squared_error(trues_rescaled, preds_rescaled))
        mae = mean_absolute_error(trues_rescaled, preds_rescaled)
        mape = mean_absolute_percentage_error(trues_rescaled, preds_rescaled) * 100
        
        metrics = {'r2': r2, 'rmse': rmse, 'mae': mae, 'mape': mape}
        
        # Save model (just one for now or all? Saving best state of first model for simplicity of file handling)
        model_dir = "model"
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, f"{task_id}.pth")
        torch.save(trained_models[0].state_dict(), model_path)
        
        return {
            "metrics": metrics,
            "predictions": preds_rescaled.tolist(),
            "true_values": trues_rescaled.tolist(),
            "model_path": model_path,
            "r2_score": r2,
            "rmse": rmse,
            "mae": mae,
            "mape": mape
        }
        
    except Exception as e:
        print(f"Error in training: {e}")
        raise e
