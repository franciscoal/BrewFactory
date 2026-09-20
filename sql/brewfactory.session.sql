-- Mejores decisiones con su razonamiento
select partida_id, ciclo, piloto, modo, retorno_3_ciclos, razonamiento
from mejores_jugadas limit 10;

-- Cuántas líneas tenía encendidas el estado que vio quien decidió
select ciclo, jsonb_path_query_array(estado_json, '$.lineas[*] ? (@.encendida == true).id') as lineas_on
from decisiones order by timestamp desc limit 5;

-- Rendimiento medio por piloto y modo
select piloto, modo, count(*) as decisiones, round(avg(retorno_hasta_final), 2) as retorno_medio
from decisiones group by 1, 2 order by 4 desc;