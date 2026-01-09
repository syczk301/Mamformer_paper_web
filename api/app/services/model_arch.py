"""
模型架构定义

包含两种不同的预测模型：

1. Mamformer (来自 train_whiteness.py)
   - 架构: MiniMamba + MiniAttention + GatedMLP
   - 特点: 简单高效，适合中小规模数据
   - Mamba块: 卷积 + 门控机制
   - 注意力: 标准多头注意力
   - 输出: 展平后直接预测

2. Auto-Mamformer (来自 auto_mamformer_bod.py)
   - 架构: SimplifiedMambaBlock + AutoformerAttention + FFN + 门控融合
   - 特点: 复杂精细，适合时序预测
   - Mamba块: 输入投影 + 卷积 + 门控
   - 注意力: 自相关机制(FFT) + 序列分解(趋势/季节)
   - 输出: 多层次特征聚合 + 残差预测 + 智能融合
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from einops import rearrange


# ============== Mamformer 模型组件 ==============
# 来源: train_whiteness.py
# 结构: Mamba + Attention + MLP

class GatedMLP(nn.Module):
    """Gated MLP / FeedForward Network"""
    def __init__(self, d_model, expansion_factor=2, dropout=0.1):
        super().__init__()
        d_inner = d_model * expansion_factor
        self.fc1 = nn.Linear(d_model, d_inner * 2) # Gated
        self.act = nn.GELU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(d_inner, d_model)
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x):
        residual = x
        x = self.norm(x)
        x_gate, x_val = self.fc1(x).chunk(2, dim=-1)
        x = self.act(x_gate) * x_val
        x = self.dropout(x)
        x = self.fc2(x)
        return x + residual

class MiniMamba(nn.Module):
    """
    最小化Mamba块 - Mamformer核心组件
    使用卷积模拟状态空间模型，配合门控机制
    """
    def __init__(self, d_model, dropout=0.2):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.conv = nn.Conv1d(d_model, d_model, kernel_size=3, padding=1, groups=d_model)
        self.act = nn.GELU()
        self.dropout = nn.Dropout(dropout)
        # Simple SSM approximation via Linear projection + gating
        self.proj = nn.Linear(d_model, d_model) 
        
    def forward(self, x):
        residual = x
        x = self.norm(x)
        # B, L, D -> B, D, L for Conv
        x_conv = self.conv(x.transpose(1, 2)).transpose(1, 2)
        x = self.act(x_conv)
        x = self.proj(x) * torch.sigmoid(x) # Simple Gating
        x = self.dropout(x)
        return x + residual

class MiniAttention(nn.Module):
    """
    增强型多头注意力机制 - Mamformer核心组件
    标准的缩放点积注意力
    """
    def __init__(self, d_model, n_heads=4, dropout=0.2):
        super().__init__()
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        
        self.qkv = nn.Linear(d_model, d_model * 3)
        self.fc = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(d_model)
        
    def forward(self, x):
        residual = x
        x = self.norm(x)
        B, L, D = x.shape
        
        qkv = self.qkv(x).chunk(3, dim=-1)
        q, k, v = [rearrange(t, 'b l (h d) -> b h l d', h=self.n_heads) for t in qkv]
        
        scores = torch.matmul(q, k.transpose(-2, -1)) / np.sqrt(self.d_k)
        attn = torch.softmax(scores, dim=-1)
        attn = self.dropout(attn)
        
        out = torch.matmul(attn, v)
        out = rearrange(out, 'b h l d -> b l (h d)')
        out = self.fc(out)
        out = self.dropout(out)
        
        return out + residual

class MamformerBlock(nn.Module):
    """
    Mamformer块 - 串联结构
    Mamba -> Attention -> MLP
    """
    def __init__(self, d_model, n_heads=4, dropout=0.2):
        super().__init__()
        self.mamba = MiniMamba(d_model, dropout)
        self.attn = MiniAttention(d_model, n_heads, dropout)
        self.mlp = GatedMLP(d_model, expansion_factor=2, dropout=dropout)
        
    def forward(self, x):
        x = self.mamba(x)
        x = self.attn(x)
        x = self.mlp(x)
        return x

class Mamformer(nn.Module):
    """
    Mamformer模型 - 来源: train_whiteness.py
    
    架构特点:
    - 输入投影: Linear + LayerNorm + GELU + Dropout
    - 核心层: MamformerBlock (Mamba + Attention + MLP) × n_layers
    - 输出: 展平 + MLP预测头
    
    适用场景: 表格数据、中小规模时序预测
    """
    def __init__(self, input_dim, d_model=128, n_layers=3, seq_len=8, pred_len=1, dropout=0.2):
        super().__init__()
        
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, d_model),
            nn.LayerNorm(d_model),
            nn.GELU(),
            nn.Dropout(dropout)
        )
        
        self.layers = nn.ModuleList([
            MamformerBlock(d_model, n_heads=4, dropout=dropout)
            for _ in range(n_layers)
        ])
        
        self.global_pool = nn.AdaptiveAvgPool1d(1) # Pooling over time dimension
        
        self.output_proj = nn.Sequential(
            nn.Linear(d_model * seq_len, d_model),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Linear(d_model // 2, pred_len)
        )
        
    def forward(self, x):
        B, L, _ = x.shape
        x = self.input_proj(x)
        
        for layer in self.layers:
            x = layer(x)
        
        # Flatten: B, L, D -> B, L*D
        x = x.reshape(B, -1)
        out = self.output_proj(x)
        return out


# ============== Auto-Mamformer 模型组件 ==============
# 来源: auto_mamformer_bod.py
# 结构: Mamba + Autoformer (自相关 + 序列分解) + 门控融合

class SeriesDecomp(nn.Module):
    """
    序列分解模块 - Autoformer核心组件
    使用移动平均分离趋势项和季节项
    """
    def __init__(self, kernel_size=25):
        super().__init__()
        self.kernel_size = kernel_size
        
    def forward(self, x):
        batch_size, seq_len, hidden = x.shape
        kernel_size = min(self.kernel_size, seq_len)
        if kernel_size < 1:
            kernel_size = 1
        x_transposed = x.transpose(1, 2)
        padding = max((kernel_size - 1) // 2, 0)
        trend = F.avg_pool1d(
            x_transposed,
            kernel_size=kernel_size,
            stride=1,
            padding=padding,
            count_include_pad=False
        )
        if trend.shape[-1] != seq_len:
            trend = F.interpolate(trend, size=seq_len, mode='linear', align_corners=False)
        trend = trend.transpose(1, 2)
        seasonal = x - trend
        return seasonal, trend


class AutoCorrelation(nn.Module):
    """
    自相关机制 - Autoformer的核心注意力机制
    使用FFT计算自相关，Top-k时间延迟聚合
    """
    def __init__(self, d_model, n_heads, factor=5):
        super().__init__()
        self.d_model = d_model
        self.n_heads = n_heads
        self.factor = factor
        self.d_k = d_model // n_heads
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        
    def time_delay_agg(self, values, corr):
        batch, head, length, channel = values.shape
        
        top_k = int(self.factor * np.log(length + 1)) if length > 1 else 1
        top_k = max(1, min(top_k, length))
        
        mean_value = torch.mean(torch.mean(corr, dim=1), dim=1)
        mean_across_batch = torch.mean(mean_value, dim=0)
        actual_k = min(top_k, mean_across_batch.size(0))
        indices = torch.topk(mean_across_batch, actual_k, dim=-1)[1]
        selected = mean_value[:, indices]
        weights = torch.softmax(selected, dim=-1)
        
        tmp_values = values.repeat(1, 1, 2, 1)
        delays_agg = torch.zeros_like(values).float()
        
        for i in range(actual_k):
            delay_idx = int(indices[i].item())
            pattern = torch.roll(tmp_values, -delay_idx, dims=2)
            delays_agg = delays_agg + pattern[:, :, :length, :] * weights[:, i:i+1].unsqueeze(1).unsqueeze(-1)
        
        return delays_agg
    
    def forward(self, q, k, v):
        B, L, D = q.shape
        H = self.n_heads
        d_k = D // H
        
        Q = self.q_proj(q).view(B, L, H, d_k).transpose(1, 2)
        K = self.k_proj(k).view(B, L, H, d_k).transpose(1, 2)
        V = self.v_proj(v).view(B, L, H, d_k).transpose(1, 2)
        
        Q = Q.float()
        K = K.float()
        V = V.float()
        
        Q_fft = torch.fft.rfft(Q, dim=2)
        K_fft = torch.fft.rfft(K, dim=2)
        corr = Q_fft * torch.conj(K_fft)
        R = torch.fft.irfft(corr, n=L, dim=2)
        
        V_agg = self.time_delay_agg(V, R)
        V_agg = V_agg.transpose(1, 2).contiguous().view(B, L, D)
        output = self.out_proj(V_agg)
        
        return output


class AutoformerAttention(nn.Module):
    """Autoformer注意力层 - 结合自相关机制和序列分解"""
    def __init__(self, d_model, n_heads, factor=5):
        super().__init__()
        self.auto_correlation = AutoCorrelation(d_model, n_heads, factor)
        self.decomp1 = SeriesDecomp(kernel_size=25)
        self.decomp2 = SeriesDecomp(kernel_size=25)
        self.norm = nn.LayerNorm(d_model)
        
    def forward(self, x):
        residual = x
        x = self.norm(x)
        seasonal, trend = self.decomp1(x)
        seasonal_out = self.auto_correlation(seasonal, seasonal, seasonal)
        x = residual + seasonal_out
        seasonal_out, trend_out = self.decomp2(x)
        return seasonal_out + trend_out


class SimplifiedMambaBlock(nn.Module):
    """简化的Mamba块 - 保持Mamba的核心思想"""
    def __init__(self, d_model, d_state=16):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state
        
        self.input_proj = nn.Linear(d_model, d_model * 2)
        self.conv1d = nn.Conv1d(d_model, d_model, kernel_size=3, padding=1, groups=d_model)
        self.gate_proj = nn.Sequential(nn.Linear(d_model, d_model), nn.Sigmoid())
        self.output_proj = nn.Linear(d_model, d_model)
        self.norm = nn.LayerNorm(d_model)
        
    def forward(self, x):
        residual = x
        x_proj = self.input_proj(self.norm(x))
        x_conv, x_gate = x_proj.chunk(2, dim=-1)
        
        x_conv_t = x_conv.transpose(1, 2)
        conv_out = self.conv1d(x_conv_t)
        conv_out = conv_out.transpose(1, 2)
        conv_out = F.silu(conv_out)
        
        gate = self.gate_proj(x_gate)
        gated_out = conv_out * gate
        output = self.output_proj(gated_out)
        
        return residual + output


class AutoMamformerBlock(nn.Module):
    """Auto-Mamformer块 - Mamba + Autoformer混合架构"""
    def __init__(self, d_model, n_heads=8, dropout=0.1):
        super().__init__()
        
        self.mamba = SimplifiedMambaBlock(d_model)
        self.autoformer_attn = AutoformerAttention(d_model, n_heads)
        self.gate = nn.Parameter(torch.tensor(0.5))
        
        self.ffn = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model * 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 4, d_model),
            nn.Dropout(dropout)
        )
        
        self.decomp_ffn = SeriesDecomp(kernel_size=25)
        
    def forward(self, x):
        mamba_out = self.mamba(x)
        autoformer_out = self.autoformer_attn(x)
        fused = self.gate * mamba_out + (1 - self.gate) * autoformer_out
        
        ffn_out = self.ffn(fused)
        seasonal, trend = self.decomp_ffn(fused + ffn_out)
        output = seasonal + trend
        
        return output


class EnhancedFeatureLearning(nn.Module):
    """增强特征学习模块"""
    def __init__(self, input_dim, output_dim):
        super().__init__()
        self.input_dim = input_dim
        self.output_dim = output_dim
        
        self.feature_transform = nn.Sequential(
            nn.Linear(input_dim, output_dim * 2),
            nn.LayerNorm(output_dim * 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(output_dim * 2, output_dim),
            nn.LayerNorm(output_dim)
        )
        
        self.feature_enhance = nn.Sequential(
            nn.Linear(output_dim, output_dim),
            nn.GELU(),
            nn.Dropout(0.1)
        )
        
    def forward(self, x):
        batch_size, seq_len, input_features = x.shape
        x_flat = x.reshape(-1, input_features)
        features = self.feature_transform(x_flat)
        enhanced = self.feature_enhance(features)
        output = enhanced.reshape(batch_size, seq_len, self.output_dim)
        return output


class AutoMamformer(nn.Module):
    """
    Auto-Mamformer模型 - 来源: auto_mamformer_bod.py
    Mamba + Autoformer混合架构
    
    架构特点:
    - 增强特征学习: 两层变换 + 特征增强
    - 位置编码: 可学习的位置嵌入
    - 核心层: AutoMamformerBlock × n_layers
      - Mamba分支: 状态空间建模
      - Autoformer分支: 自相关(FFT) + 序列分解
      - 门控融合: 可学习权重融合两分支
    - 特征聚合: 最后时刻 + 全局平均池化 + 全局最大池化
    - 预测头: MLP + 残差预测 + 智能融合
    
    适用场景: 复杂时序预测、需要捕捉周期性和趋势的场景
    """
    def __init__(self, input_dim, d_model=128, n_layers=4, seq_len=24, pred_len=1, dropout=0.15):
        super().__init__()
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.d_model = d_model
        
        # 1. 增强特征学习
        self.feature_learning = EnhancedFeatureLearning(input_dim, d_model)
        
        # 2. 位置编码
        self.pos_embedding = nn.Parameter(torch.randn(seq_len, d_model) * 0.01)
        
        # 3. Auto-Mamformer层
        self.layers = nn.ModuleList([
            AutoMamformerBlock(d_model, n_heads=8, dropout=dropout)
            for _ in range(n_layers)
        ])
        
        # 4. 特征聚合
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.max_pool = nn.AdaptiveMaxPool1d(1)
        
        # 5. 预测头
        self.prediction_head = nn.Sequential(
            nn.Linear(d_model * 3, d_model),
            nn.LayerNorm(d_model),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, pred_len)
        )
        
        # 6. 残差预测
        self.linear_residual = nn.Linear(input_dim, pred_len)
        self.ar_residual = nn.Linear(1, pred_len)
        
        # 7. 融合权重
        self.fusion_weights = nn.Parameter(torch.tensor([0.8, 0.15, 0.05]))
        
        self.apply(self._init_weights)
        
    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            torch.nn.init.xavier_uniform_(module.weight, gain=0.5)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, (nn.LayerNorm, nn.BatchNorm1d)):
            torch.nn.init.ones_(module.weight)
            torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Conv1d):
            torch.nn.init.kaiming_normal_(module.weight, mode='fan_out', nonlinearity='relu')
    
    def forward(self, x):
        batch_size, seq_len, _ = x.shape
        x_raw = x
        
        # 1. 增强特征学习
        features = self.feature_learning(x)
        
        # 2. 位置编码
        features = features + self.pos_embedding[:seq_len].unsqueeze(0)
        
        # 3. 通过Auto-Mamformer层
        for layer in self.layers:
            features = layer(features)
        
        # 4. 多层次特征聚合
        seq_features = features[:, -1, :]
        features_conv = features.transpose(1, 2)
        global_avg = self.global_pool(features_conv).squeeze(-1)
        global_max = self.max_pool(features_conv).squeeze(-1)
        
        combined_features = torch.cat([seq_features, global_avg, global_max], dim=1)
        
        # 5. 主预测
        main_pred = self.prediction_head(combined_features)
        
        # 6. 残差预测
        linear_pred = self.linear_residual(x_raw[:, -1, :])
        ar_pred = self.ar_residual(x_raw[:, -1, -1].unsqueeze(-1))
        
        # 7. 智能融合
        weights = F.softmax(self.fusion_weights, dim=0)
        final_pred = (weights[0] * main_pred + 
                     weights[1] * linear_pred + 
                     weights[2] * ar_pred)
        
        return final_pred
