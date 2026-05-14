import google.genai as genai
from google.genai import types
import json

class SRIClassifier:
    """
    Clasificador especializado en el SRI de Ecuador.
    Agrupa gastos en las categorías deducibles oficiales.
    """
    
    SRI_CATEGORIES = [
        "Alimentación",
        "Educación, Arte y Cultura",
        "Salud",
        "Vivienda",
        "Vestimenta",
        "Turismo",
        "No Deducible"
    ]

    # Mapeo oficial SRI para Declaración de Impuesto a la Renta
    SRI_CONCEPTS = {
        "Educación, Arte y Cultura": "5040",
        "Salud": "3290",
        "Alimentación": "3300",
        "Vivienda": "3310",
        "Vestimenta": "3320",
        "Turismo": "3325",
        "Total Deducciones": "3330",
        "RUC Contador": "100"
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)

    def classify(self, description: str, category_name: str = "") -> str:
        """Determina a qué grupo del SRI pertenece un gasto."""
        
        system_instruction = f"""
        Eres un experto tributario en Ecuador. 
        Clasifica la transacción en una de estas categorías del SRI:
        {json.dumps(self.SRI_CATEGORIES, ensure_ascii=False)}
        
        Guía rápida:
        - Supermercados, Restaurantes -> Alimentación
        - Farmacias, Hospitales, Médicos -> Salud
        - Arriendo, Alícuota, Ferretería (reparaciones), Luz, Agua -> Vivienda
        - Colegios, Libros, Gimnasio, Cursos -> Educación, Arte y Cultura
        - Ropa, Zapatos -> Vestimenta
        - Hoteles, Pasajes aéreos -> Turismo
        - Todo lo demás -> No Deducible
        """
        
        prompt = f"Transacción: '{description}' (Categoría interna: {category_name})"
        
        try:
            response = self.client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=system_instruction + "\n\n" + prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "object",
                        "properties": {
                            "sri_category": {"type": "string", "enum": self.SRI_CATEGORIES},
                            "reason": {"type": "string"}
                        },
                        "required": ["sri_category"]
                    }
                )
            )
            result = json.loads(response.text)
            return result.get("sri_category", "No Deducible")
        except:
            return "No Deducible"
