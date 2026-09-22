import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from middleware.security import SecurityMiddleware


def test_security_middleware_blocks_lan_financial_routes():
    request = SimpleNamespace(
        headers={},
        client=SimpleNamespace(host="192.168.1.50"),
        url=SimpleNamespace(path="/accounts/"),
    )

    async def call_next(_request):
        raise AssertionError("La petición LAN no debe alcanzar el endpoint")

    middleware = SecurityMiddleware()
    request_coro = middleware(request, call_next)
    with pytest.raises(HTTPException) as error:
        asyncio.run(request_coro)

    assert error.value.status_code == 403
