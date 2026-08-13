from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from app.api.crud_factory import make_crud_router
from app.models.category import Category
from pydantic import BaseModel
from fastapi.responses import JSONResponse


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


def _register_export(router: APIRouter) -> None:
    # Debe registrarse antes de GET /{category_id} - ver nota en crud_factory.py.
    @router.get("/export", response_class=JSONResponse)
    def export_categories(db: Session = Depends(get_db)):
        """Export all categories to JSON"""
        categories = db.query(Category).filter(Category.is_deleted == False).all()  # noqa: E712
        categories_data = [
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "color": category.color,
                "icon": category.icon,
                "is_default": category.is_default,
                "version": category.version,
            }
            for category in categories
        ]
        return JSONResponse(content=categories_data)


router: APIRouter = make_crud_router(
    prefix="/categories",
    tags=["categories"],
    model=Category,
    create_schema=CategoryCreate,
    update_schema=CategoryUpdate,
    response_schema=CategoryResponse,
    entity_name="Category",
    before_id_routes=_register_export,
)


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
                    version=category_data.get("version", 0),
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
        "errors": errors,
    }
