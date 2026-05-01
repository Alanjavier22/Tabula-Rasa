import requests

BASE_URL = "http://127.0.0.1:8000/categories/"

categories = [
    {"name": "Gym", "description": "Gimnasio", "color": "#FF6B6B", "is_default": False},
    {"name": "Pasaje", "description": "Transporte publico", "color": "#4ECDC4", "is_default": False},
    {"name": "Netflix", "description": "Suscripcion Netflix", "color": "#E50914", "is_default": False},
    {"name": "Fiboeduc", "description": "Tutoria para sobrinos", "color": "#9B59B6", "is_default": False},
    {"name": "Tuenti", "description": "Recarga celular/internet", "color": "#3498DB", "is_default": False},
    {"name": "Comidas", "description": "Restaurantes y cenas", "color": "#F39C12", "is_default": False},
    {"name": "Tarjeta de Credito", "description": "Pago tarjeta de credito Visa", "color": "#E74C3C", "is_default": False},
    {"name": "Saludsa", "description": "Seguros y salud", "color": "#2ECC71", "is_default": False},
    {"name": "Varios", "description": "Gastos varios", "color": "#95A5A6", "is_default": False},
    {"name": "Meta", "description": "Ahorros e inversiones", "color": "#1ABC9C", "is_default": False},
    {"name": "Deprati", "description": "Compras en Deprati", "color": "#E67E22", "is_default": False},
    {"name": "Retiro de Efectivo", "description": "Retiros de cajero automatico", "color": "#7F8C8D", "is_default": False},
    {"name": "Compras Locales", "description": "Compras con tarjeta local", "color": "#16A085", "is_default": False},
    {"name": "Transferencias", "description": "Transferencias bancarias", "color": "#8E44AD", "is_default": False},
    {"name": "Matricula Vehiculo", "description": "Matricula del carro", "color": "#C0392B", "is_default": False},
    {"name": "Impuestos Municipales", "description": "Impuestos municipales", "color": "#D35400", "is_default": False},
    {"name": "Combustible", "description": "Gasolina y combustible vehiculo", "color": "#E74C3C", "is_default": False},
    {"name": "Mantenimiento Vehiculo", "description": "Mecanica, neumaticos y mantenimiento", "color": "#9B59B6", "is_default": False},
    {"name": "Seguro Vehiculo", "description": "Seguro del vehiculo/auto", "color": "#3498DB", "is_default": False},
    {"name": "Peaje/Parqueo", "description": "Peajes y estacionamientos", "color": "#1ABC9C", "is_default": False},
    {"name": "Uber", "description": "Transporte Uber", "color": "#1F618D", "is_default": False},
    {"name": "Sueldo", "description": "Ingresos de sueldo", "color": "#27AE60", "is_default": False},
]

for category in categories:
    try:
        response = requests.post(BASE_URL, json=category)
        if response.status_code == 200:
            print(f"Created: {category['name']}")
        else:
            print(f"Failed to create {category['name']}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error creating {category['name']}: {e}")

print("\nDone creating categories!")
