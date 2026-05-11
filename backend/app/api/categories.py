from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from app.api.auth import get_current_device
from app.models.category import Category
from pydantic import BaseModel
from fastapi.responses import JSONResponse
import json

router = APIRouter(prefix="/categories", tags=["categories"], dependencies=[Depends(get_current_device)], redirect_slashes=False)


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = False


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = False
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


@router.post("/", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    db_category = Category(**category.dict())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


@router.get("/", response_model=List[CategoryResponse])
def get_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    categories = db.query(Category).filter(Category.is_deleted == False).offset(skip).limit(limit).all()
    return categories


@router.get("/export", response_class=JSONResponse)
def export_categories(db: Session = Depends(get_db)):
    """Export all categories to JSON"""
    categories = db.query(Category).filter(Category.is_deleted == False).all()
    categories_data = []
    
    for category in categories:
        categories_data.append({
            "id": category.id,
            "name": category.name,
            "description": category.description,
            "color": category.color,
            "icon": category.icon,
            "is_default": category.is_default,
            "version": category.version
        })
    
    return JSONResponse(content=categories_data)


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: str, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: str, category: CategoryUpdate, db: Session = Depends(get_db)):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = category.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)
    
    db.commit()
    db.refresh(db_category)
    return db_category


@router.delete("/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(db_category)
    db.commit()
    return {"message": "Category deleted successfully"}


@router.post("/import")
def import_categories(categories_data: List[dict], db: Session = Depends(get_db)):
    """Import categories from JSON - rejects duplicates by name"""
    imported_count = 0
    skipped_count = 0
    errors = []
    
    for category_data in categories_data:
        try:
            # Check if category with same name already exists
            existing = db.query(Category).filter(Category.name == category_data.get("name")).first()
            
            if existing:
                # Skip if already exists (don't update)
                skipped_count += 1
            else:
                # Create new category
                new_category = Category(
                    id=category_data.get("id"),  # Keep original ID or let DB generate new one
                    name=category_data.get("name", ""),
                    description=category_data.get("description"),
                    color=category_data.get("color"),
                    icon=category_data.get("icon"),
                    is_default=category_data.get("is_default", False),
                    version=category_data.get("version", 0)
                )
                db.add(new_category)
                db.commit()
                imported_count += 1
        except Exception as e:
            errors.append(f"Error importing category {category_data.get('name', 'unknown')}: {str(e)}")
            db.rollback()
    
    return {
        "message": "Import completed",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "errors": errors
    }
