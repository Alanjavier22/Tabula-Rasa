"""
Factory de router CRUD compartido.

La mayoría de los módulos en app/api/*.py repiten exactamente el mismo patrón
para create/get/update/delete (query, 404 si no existe, model_dump(exclude_unset=True)
+ setattr en loop para el update, etc). Este factory genera esas partes idénticas
una sola vez; cada módulo sigue siendo dueño de sus schemas Pydantic, de sus
endpoints extra (ej. accounts.set_balance, subscriptions.pay_subscription), y de
cualquier lógica de negocio (soft-delete con efectos secundarios, filtros de
listado custom, etc) - esos casos simplemente no usan este factory, o usan sólo
una parte de él (ej. include_list=False para escribir el listado a mano).

No fuerces un módulo a encajar acá si su delete/list tiene lógica de negocio no
trivial (ver goals.py, budgets.py) - la abstracción sólo vale la pena cuando el
endpoint es mecánico de verdad.
"""
from typing import Any, Callable, List, Optional, Type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_device
from database import get_db


def make_crud_router(
    *,
    prefix: str,
    tags: List[str],
    model: Type[Any],
    create_schema: Type[BaseModel],
    update_schema: Type[BaseModel],
    response_schema: Type[BaseModel],
    entity_name: str,
    filter_deleted: bool = True,
    include_list: bool = True,
    include_delete: bool = True,
    pre_create: Optional[Callable[[BaseModel, Session], None]] = None,
    pre_update: Optional[Callable[[Any, BaseModel, Session], None]] = None,
    before_id_routes: Optional[Callable[[APIRouter], None]] = None,
) -> APIRouter:
    """
    Genera POST /, [GET /], GET /{id}, PUT /{id}, [DELETE /{id}].

    - filter_deleted: si el modelo tiene `is_deleted`, el listado y el 404 de
      lectura lo respetan (soft-deleted no aparece).
    - include_list/include_delete: apagalos si el módulo necesita escribir esa
      parte a mano (filtros custom en el listado, delete con efectos secundarios).
    - pre_create/pre_update: hooks para validaciones (ej. checkear que un FK
      referenciado existe) - deben levantar HTTPException si algo no es válido.
    - before_id_routes: hook para registrar rutas estáticas propias (ej. GET
      /pending) ANTES de que se registre GET /{id} - FastAPI matchea por orden
      de registro, así que una ruta estática después de /{id} queda inalcanzable.
    """
    router = APIRouter(
        prefix=prefix,
        tags=tags,
        dependencies=[Depends(get_current_device)],
        redirect_slashes=False,
    )

    @router.post("/", response_model=response_schema)
    def create(payload: create_schema, db: Session = Depends(get_db)):  # type: ignore[valid-type]
        if pre_create:
            pre_create(payload, db)
        db_obj = model(**payload.model_dump())
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    if include_list:
        @router.get("/", response_model=List[response_schema])
        def list_all(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
            query = db.query(model)
            if filter_deleted:
                query = query.filter(model.is_deleted == False)  # noqa: E712
            return query.offset(skip).limit(limit).all()

    if before_id_routes:
        before_id_routes(router)

    @router.get("/{item_id}", response_model=response_schema)
    def get_one(item_id: str, db: Session = Depends(get_db)):
        obj = db.query(model).filter(model.id == item_id).first()
        if not obj:
            raise HTTPException(status_code=404, detail=f"{entity_name} not found")
        return obj

    @router.put("/{item_id}", response_model=response_schema)
    def update(item_id: str, payload: update_schema, db: Session = Depends(get_db)):  # type: ignore[valid-type]
        obj = db.query(model).filter(model.id == item_id).first()
        if not obj:
            raise HTTPException(status_code=404, detail=f"{entity_name} not found")
        if pre_update:
            pre_update(obj, payload, db)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        db.commit()
        db.refresh(obj)
        return obj

    if include_delete:
        @router.delete("/{item_id}")
        def delete(item_id: str, db: Session = Depends(get_db)):
            obj = db.query(model).filter(model.id == item_id).first()
            if not obj:
                raise HTTPException(status_code=404, detail=f"{entity_name} not found")
            db.delete(obj)
            db.commit()
            return {"message": f"{entity_name} deleted successfully"}

    return router
