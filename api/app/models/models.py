import uuid
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    data_files = relationship("DataFile", back_populates="owner", cascade="all, delete-orphan")
    training_tasks = relationship("TrainingTask", back_populates="owner", cascade="all, delete-orphan")

class DataFile(Base):
    __tablename__ = "data_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    rows = Column(Integer, nullable=False)
    columns = Column(Integer, nullable=False)
    column_info = Column(JSON, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="data_files")
    training_tasks = relationship("TrainingTask", back_populates="data_file", cascade="all, delete-orphan")

class TrainingTask(Base):
    __tablename__ = "training_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    data_id = Column(UUID(as_uuid=True), ForeignKey("data_files.id"), nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    config = Column(JSON, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="training_tasks")
    data_file = relationship("DataFile", back_populates="training_tasks")
    result = relationship("TrainingResult", back_populates="task", uselist=False, cascade="all, delete-orphan")

class TrainingResult(Base):
    __tablename__ = "training_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("training_tasks.id"), unique=True, nullable=False)
    r2_score = Column(Float, nullable=False)
    rmse = Column(Float, nullable=False)
    mae = Column(Float, nullable=False)
    mape = Column(Float, nullable=False)
    metrics = Column(JSON, nullable=False)
    model_path = Column(String, nullable=False)
    plot_path = Column(String, nullable=True)
    predictions = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("TrainingTask", back_populates="result")

class TrainingLog(Base):
    __tablename__ = "training_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("training_tasks.id"), nullable=False)
    epoch = Column(Integer, nullable=False)
    train_loss = Column(Float, nullable=False)
    val_loss = Column(Float, nullable=True)
    metrics = Column(JSON, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("TrainingTask", back_populates="logs")

# Update TrainingTask to include logs relationship
TrainingTask.logs = relationship("TrainingLog", back_populates="task", cascade="all, delete-orphan")
