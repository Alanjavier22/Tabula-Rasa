from app.services.ai_prompts import CORE_RULES, PERSONA_PROMPTS, get_persona_prompt


def test_personas_have_safe_bounded_style_instructions():
    assert len(PERSONA_PROMPTS) == 8
    assert "Nunca inventes cifras" in CORE_RULES
    assert "read-only" in CORE_RULES.lower()

    for persona_key in PERSONA_PROMPTS:
        prompt = get_persona_prompt(persona_key)
        assert prompt.strip()

    assert "salud mental" in get_persona_prompt("roast").lower()
    assert "dólares" in get_persona_prompt("gamified").lower()
    assert get_persona_prompt("persona-desconocida") == get_persona_prompt("professional")
