# Prueba de Chat y Flujo

## Descripción
Hemos creado el usuario `user1-preicfes@estudiando.co` el cual pertenece al inquilino **PreICFES Estudiando**, con el propósito de cargarle:
+ Base de conocimiento
+ Preguntas frecuentes
+ Flujos de trabajo (Flows)
+ Probar chat de la presente feature (una vez se cargue lo necesario)

*Nota: sí es necesario anexar mas items de configuración a `SofiApp` me indicas cuales son.*

## Objetivo

Tengo una documentación de un flujo alojada en `E:\dev\sofiapp\.test-chat\EJEMPLOS SOFIAPP.docx`, la cual busca ser probada desde `SofiApp`, es una descripción de lo que se espera que nuestra App haga. Para ello debemos simular información puntual de cursos, en las tardes para colegios que trabajan en las mañanas, y viceversa, además de cursos los sábados. Pueden ser complementos como: horarios, mision, vision, dirección, precios. 

*Nota: esta información la podrás inventar acorde al negocio de un PreICFES tomando como base el documento mencionado.*

## Formato de salida

Genera un documento en formato markdown llamado `00-test-preicfes.md` junto al archivo de ejemplos. Deben estar los apartados de cada cosa para poder cargar a `SofiApp`, ademas en los flujos donde se pretenda enviar mensajes puedes usar emojis sin exederte pero amigable. 

*Nota: aparte de generar estos contenidos, actualmente me encuentro con la sesión iniciado del usuario del PreICFES, ¿podrias después de generar el contenido tambien subirlo donde corresponda?*

## Documentación de los nodos de flujos

En los `flows` existen diferentes nodos que me gustaria enteder bien como funcionan para poder crear de forma libre varios flujos, por tanto necesito una tabla que describa *qué hace*, *cómo se relacionaría con otro nodo*, *cuándo usarlo*, y demás items que consideres relevante crear. Esta documentación debera estar en la misma carpeta que el archivo anterior con nombre `00-flows-documentation.md`.

## Preguntas

Sí tienes preguntas o no es clara una parte de tu tarea puedes decirlo. **No toques nada del código actual, solo haremos la prueba con esta carpeta `./test-chat/`.**