"""
                                        NOTAS

1. Uso de 'response_model' en el decorador:
   @router.post('/token', response_model=schemas.Token)

   - FastAPI utiliza 'response_model' para:
     - validar la respuesta
     - serializar los datos
     - filtrar campos sensibles
     - generar el esquema OpenAPI (docs swagger)

2. Uso de type hints en la firma:
   def login_for_access_token(...) -> schemas.Token:

   - El type hint es solo para Python:
     - autocompletado
     - análisis estático
     - legibilidad
   - FastAPI NO lo utiliza para validar ni serializar la respuesta

Conclusión:
- `response_model` es el mecanismo correcto para APIs FastAPI
- El type hint es opcional en endpoints y no reemplaza `response_model`
- La diferencia es de arquitectura y claridad, no de rendimiento
"""
