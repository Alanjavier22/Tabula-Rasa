import importlib
import socket
import sys
from unittest.mock import MagicMock, patch


with patch.dict(sys.modules, {"trustme": MagicMock()}):
    ssl_setup = importlib.import_module("ssl_setup")


def test_get_local_ip_returns_first_non_loopback_address(monkeypatch):
    loopback_ip = socket.inet_ntoa(bytes((127, 0, 0, 1)))
    local_ip = socket.inet_ntoa(bytes((192, 0, 2, 10)))

    monkeypatch.setattr(ssl_setup.socket, "gethostname", lambda: "local-host")
    monkeypatch.setattr(
        ssl_setup.socket,
        "getaddrinfo",
        lambda *args: [
            (socket.AF_INET, socket.SOCK_DGRAM, 0, "", (loopback_ip, 0)),
            (socket.AF_INET, socket.SOCK_DGRAM, 0, "", (local_ip, 0)),
        ],
    )

    assert ssl_setup.get_local_ip() == local_ip


def test_get_local_ip_falls_back_to_loopback_when_resolution_fails(monkeypatch):
    loopback_ip = socket.inet_ntoa(bytes((127, 0, 0, 1)))

    def fail_resolution(*args):
        raise OSError("hostname resolution failed")

    monkeypatch.setattr(ssl_setup.socket, "getaddrinfo", fail_resolution)

    assert ssl_setup.get_local_ip() == loopback_ip
