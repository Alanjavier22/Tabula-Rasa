"""
Test Scenario: FASE 4 - AI Zero-Knowledge Categorization
Tests Ecuadorian bank transaction categorization with privacy sanitization
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.categorizer import get_semantic_category
from app.services.privacy import mask_description
from database import SessionLocal, engine, Base
from app.models.category import Category

def test_ecuadorian_categorization():
    """
    Test: Categorize Ecuadorian bank transaction descriptions
    """
    print("=== Test: Ecuadorian Bank Transaction Categorization ===\n")
    
    # Test cases with Ecuadorian-specific descriptions
    test_cases = [
        {
            "description": "Supermaxi Av. Amazonas",
            "amount": 4500,  # $45.00
            "expected_category": "Comestibles",
            "has_pii": False,
        },
        {
            "description": "Pago IESS Nomina 1712345678",
            "amount": 125000,  # $1250.00
            "expected_category": "Salud/Impuestos",
            "has_pii": True,  # Contains Ecuadorian ID
        },
        {
            "description": "Netflix suscripcion mensual",
            "amount": 1299,  # $12.99
            "expected_category": "Entretenimiento",
            "has_pii": False,
        },
        {
            "description": "Transferencia a Juan Perez 0912345678",
            "amount": 50000,  # $500.00
            "expected_category": "Transferencias",
            "has_pii": True,  # Contains name and Ecuadorian ID
        },
        {
            "description": "Uber viaje a centro",
            "amount": 850,  # $8.50
            "expected_category": "Transporte",
            "has_pii": False,
        },
    ]
    
    db = SessionLocal()
    
    try:
        # Ensure categories exist
        categories = db.query(Category).all()
        if not categories:
            print("⚠️ No categories found in database - skipping categorization test")
            return
        
        print(f"✅ Found {len(categories)} categories in database\n")
        
        for i, test in enumerate(test_cases, 1):
            print(f"--- Test Case {i}: {test['description']} ---")
            print(f"Amount: ${test['amount'] / 100:.2f}")
            
            # Step 1: Test privacy sanitization
            sanitized = mask_description(test['description'])
            print(f"Original: {test['description']}")
            print(f"Sanitized: {sanitized}")
            
            # Check if PII was detected
            if test['has_pii']:
                if sanitized == test['description']:
                    print("❌ FAIL: PII not detected/sanitized")
                else:
                    print("✅ PASS: PII detected and sanitized")
            else:
                if sanitized == test['description']:
                    print("✅ PASS: No PII detected (as expected)")
                else:
                    print("⚠️ WARN: Unexpected sanitization (no PII expected)")
            
            # Step 2: Test AI categorization
            category_id = get_semantic_category(test['description'], test['amount'], db)
            
            if category_id:
                category = db.query(Category).filter(Category.id == category_id).first()
                category_name = category.name if category else "Unknown"
                print(f"AI Category: {category_name} (ID: {category_id})")
                
                if category_name == test['expected_category']:
                    print("✅ PASS: Category matches expected")
                else:
                    print(f"⚠️ WARN: Expected '{test['expected_category']}', got '{category_name}'")
            else:
                print("❌ FAIL: No category returned")
            
            print()
    
    finally:
        db.close()

def test_privacy_sanitization():
    """
    Test: Privacy layer sanitization with hydration
    """
    print("\n=== Test: Privacy Sanitization ===\n")
    
    test_descriptions = [
        "Pago a Maria Garcia 0912345678",
        "Transferencia Banco Pichincha 1712345678001",
        "Compra Supermaxi con tarjeta ****1234",
    ]
    
    for desc in test_descriptions:
        sanitized = mask_description(desc)
        print(f"Original: {desc}")
        print(f"Sanitized: {sanitized}")
        
        # Check for PII patterns
        if "[TAX_ID_" in sanitized or "[ACCOUNT_" in sanitized or "[PERSON_" in sanitized:
            print("✅ PII detected and tokenized")
        else:
            print("⚠️ No PII detected")
        print()

def main():
    """
    Run the complete test scenario
    """
    print("=" * 60)
    print("FASE 4: AI Zero-Knowledge Categorization Test")
    print("Scenario: Ecuadorian bank transaction classification")
    print("=" * 60)
    print()
    
    # Test privacy sanitization
    test_privacy_sanitization()
    
    # Test AI categorization
    test_ecuadorian_categorization()
    
    print("\n" + "=" * 60)
    print("✅ TESTS COMPLETED")
    print("=" * 60)

if __name__ == "__main__":
    main()
