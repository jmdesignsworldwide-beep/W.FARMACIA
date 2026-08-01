-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0018 — Listado de Medicamentos de Venta Libre (MVL)
-- ADN JM NEXUS · base regulatoria de requiere_receta (Adenda IV · punto 5)
-- Fuente: Resolución No. 000009, MISPAS/DIGEMAPS, 26 JUN 2017 (207 principios).
-- ════════════════════════════════════════════════════════════════════
-- Tabla de REFERENCIA (no inventario), hermana de medicamento_oficial.
-- Reglas fijadas por Marien (2026-08-01):
--   • Carga literal de las 207. Regla de derivados: DOCUMENTADA, no automatizada.
--   • Asimetria de seguridad: estar en la lista -> venta libre (dato oficial);
--     NO estar -> "sin determinar", se trata como que EXIGE receta + "verificar".
--     El unico error inaceptable es el falso positivo (marcar venta libre algo
--     que exige receta). Todo camino dudoso cae en "no consta -> exige receta".
--   • Topes de concentracion: se guardan (comparacion directa, no inferencia).
--     Si el tope es null, el sistema NO asume nada -> "no consta".
--   • Combos: coincidencia EXACTA de composicion (firma por IDs, Camino A).
--   • Camino A: el match se enciende cuando exista el catalogo de principios
--     (firma_composicion se llena al enlazar). Hoy nada esta enlazado -> la
--     funcion devuelve "no consta (catalogo_incompleto)" para TODO. Lado seguro.
--   • Entradas ambiguas ("X o Y", "COMBINADO CON:", sinonimos entre parentesis):
--     marcadas ambigua=true, tratadas como "no consta" hasta resolverlas a mano.
--   • Las 14 celdas de concentracion tachadas en el original: tope_ilegible=true,
--     tope null ("no consta el tope - verificar"). Nunca se adivinan.
--   • Procedencia (fuente + fecha) guardada en cada fila.
--   • Idempotente por clave_semilla (recarga nunca ciega).
-- ════════════════════════════════════════════════════════════════════

-- ── 1) Tabla de referencia ──────────────────────────────────────────
create table if not exists public.medicamento_venta_libre (
  id                   uuid primary key default gen_random_uuid(),
  orden                int  not null,                                   -- 1..207 en la resolucion
  nombre_generico      text not null,                                   -- principio activo / composicion (literal)
  nombre_normalizado   text generated always as (app.slug(nombre_generico)) stored,
  concentracion_texto  text,                                            -- literal (incl. "Hasta 500 mg" o marcador ILEGIBLE)
  tope_valor           numeric,                                         -- tope estructurado (comparacion directa); null = no consta
  tope_unidad          public.unidad_concentracion,
  tope_ilegible        boolean not null default false,                  -- 14 celdas tachadas en el origen
  forma_farmaceutica   text,
  observaciones        text,
  ambigua              boolean not null default false,                  -- "o" alternativas / "COMBINADO CON" / sinonimos ( )
  firma_composicion    text,                                            -- Camino A: IDs de principios (null hasta enlazar el catalogo)
  principios_enlazados boolean generated always as (firma_composicion is not null) stored,
  fuente               text not null default 'Resolución 000009-17 (MISPAS/DIGEMAPS)',
  fecha_resolucion     date not null default date '2017-06-26',
  clave_semilla        text not null,                                   -- estable para recarga idempotente
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint mvl_tope_unidad_coherente check ((tope_valor is null) = (tope_unidad is null))
);
comment on table public.medicamento_venta_libre is
  'Listado oficial de Medicamentos de Venta Libre (MVL). REFERENCIA regulatoria de requiere_receta, no inventario. Fuente: Resolucion 000009-17 MISPAS/DIGEMAPS. Identidad estable por clave_semilla (idempotente). El match producto<->MVL usa firma por IDs (Camino A) y se enciende al enlazar con el catalogo de principios.';
comment on column public.medicamento_venta_libre.firma_composicion is
  'Firma de composicion por IDs de principio_activo (mismo criterio que producto.firma_molecula, sin forma/via). NULL hasta enlazar con el catalogo. Mientras sea null, la funcion cae del lado seguro ("no consta").';
comment on column public.medicamento_venta_libre.ambigua is
  'La composicion no se puede resolver sin criterio humano (alternativas "X o Y", "COMBINADO CON:", sinonimos entre parentesis). Se trata como "no consta" aunque tenga firma, hasta resolverla a mano.';

create unique index if not exists uq_mvl_clave  on public.medicamento_venta_libre (clave_semilla);
create unique index if not exists uq_mvl_orden  on public.medicamento_venta_libre (orden);
create index        if not exists idx_mvl_firma on public.medicamento_venta_libre (firma_composicion);
create index        if not exists idx_mvl_norm  on public.medicamento_venta_libre using gin (nombre_normalizado extensions.gin_trgm_ops);

drop trigger if exists trg_mvl_updated_at on public.medicamento_venta_libre;
create trigger trg_mvl_updated_at before update on public.medicamento_venta_libre
  for each row execute function app.set_updated_at();
drop trigger if exists trg_mvl_audit on public.medicamento_venta_libre;
create trigger trg_mvl_audit after insert or update or delete on public.medicamento_venta_libre
  for each row execute function app.audit();

-- ── 2) Semilla idempotente de las 207 (on conflict por clave_semilla) ─
insert into public.medicamento_venta_libre
  (orden, nombre_generico, concentracion_texto, tope_valor, tope_unidad, tope_ilegible,
   forma_farmaceutica, observaciones, ambigua, clave_semilla)
values
(1,'ACEITE DE HIGADO DE BACALAO + EXTRACTO DE MALTA','NO DEBE EXCEDER LA DOSIS DIARIA RECOMENDADA',null,null,false,'EMULSION','No superar la dosis recomendada.',false,'RES000009-17#001'),
(2,'ACEITE DE HIGADO DE BACALAO + VITAMINA C','NO DEBE EXCEDER LA DOSIS DIARIA RECOMENDADA',null,null,false,'EMULSION','No superar la dosis recomendada.',false,'RES000009-17#002'),
(3,'ACEITE DE HIGADO DE BACALAO + VITAMINA E','NO DEBE EXCEDER LA DOSIS DIARIA RECOMENDADA',null,null,false,'CAPSULA BLANDAS','No superar la dosis recomendada.',false,'RES000009-17#003'),
(4,'ACEITE DE LINAZA','1000 mg',1000,'mg',false,'CAPSULA BLANDAS','No superar la dosis recomendada.',false,'RES000009-17#004'),
(5,'ACETAMINOFEN (PARACETAMOL)','1000 mg',1000,'mg',false,'CAPLETA / TABLETA / COMPRIMIDO / COMPRIMIDOS EFERVESCENTES','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#005'),
(6,'ACETAMINOFEN (PARACETAMOL)','500 mg',500,'mg',false,'SUPOSITORIO','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#006'),
(7,'ACETAMINOFEN (PARACETAMOL)','50 mg',50,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#007'),
(8,'ACETAMINOFEN (PARACETAMOL)','160 mg / 5 mL',null,null,false,'JARABE / SUSPENSION','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#008'),
(9,'ACETAMINOFEN (PARACETAMOL)','100 mg / mL',null,null,false,'SOLUCION GOTAS ORALES','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#009'),
(10,'ACETAMINOFEN (PARACETAMOL) COMBINADO CON: AMANTADINA CLORHIDRATO + FENILEFRINA CLORHIDRATO','Hasta 500 mg de Acetaminofen + 50 mg Amantadina + 10 mg Fenilefrina',null,null,false,'TABLETA / COMPRIMIDO','La amantadina debera usarse con precaucion en pacientes con disfuncion hepatica. Se han observado algunos casos un aumento de las transaminasas. La amantadina puede producir insomnio. La dosis de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento y en pacientes que no tengan insuficiencia hepatica. Su uso puede afectar el sueno y el reposo normal.',true,'RES000009-17#010'),
(11,'ACETAMINOFEN (PARACETAMOL) + ACIDO ACETILSALICILICO + CAFEINA','250 mg + 250 mg + 65 mg',null,null,false,'CAPLETA / TABLETA / COMPRIMIDOS RECUBIERTOS','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica. No debe ingerirse alcohol en concomitancia al uso de acido acetilsalicilico, ya que incrementa los efectos adversos gastrointestinales del acido acetilsalicilico, y es un factor desencadenante en la irritacion cronica producida por el acido acetilsalicilico. La utilizacion del acido acetilsalicilico en pacientes que consumen habitualmente alcohol.',true,'RES000009-17#011'),
(12,'ACETAMINOFEN (PARACETAMOL) + CAFEINA','Hasta 500 mg Acetaminofen / 65 mg de Cafeina',null,null,false,'CAPLETA / TABLETA / COMPRIMIDOS RECUBIERTAS','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento y en pacientes que no tengan insuficiencia hepatica. Su uso puede afectar el sueno y el reposo normal.',true,'RES000009-17#012'),
(13,'ACETAMINOFEN (PARACETAMOL) + DEXCLORFENIRAMINA MALEATO','100 mg + 0.5 mg / mL',null,null,false,'SOLUCION ORAL GOTAS','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica. Si luego de tres dias de tratamiento persisten los sintomas acudir a su medico o a una unidad de salud.',true,'RES000009-17#013'),
(14,'ACETAMINOFEN (PARACETAMOL) + FENILEFRINA HCL + CETIRIZINA DICLORHIDRATO','325 mg + 5 mg + 5 mg / 5 mL',null,null,false,'JARABE','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica. Si luego de tres dias persisten los sintomas acuda a su medico o a la unidad de salud mas cercana.',true,'RES000009-17#014'),
(15,'ACETAMINOFEN (PARACETAMOL) COMBINADO CON: FENILEFRINA CLORHIDRATO + CETIRIZINA DICLORHIDRATO','Hasta 500 mg de Acetaminofen + 10 mg Fenilefrina + 5 mg Cetirizina',null,null,false,'TABLETA / COMPRIMIDO / CAPLETA / CAPSULAS / POLVO PARA SOLUCION ORAL','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica.',true,'RES000009-17#015'),
(16,'ACETAMINOFEN (PARACETAMOL) COMBINADO CON: CLORFENIRAMINA MALEATO + (DEXTROMETORFANO BROMHIDRATO o BROMHEXINA CLORHIDRATO) + FENILEFRINA CLORHIDRATO','Hasta 500 mg Acetaminofen + 5 mg Clorfeniramina + (30 mg Dextrometorfano o 8 mg Bromhexina) + 10 mg Fenilefrina',null,null,false,'TABLETA / COMPRIMIDO / CAPLETA / CAPSULAS / POLVO PARA SOLUCION ORAL / COMPRIMIDOS EFERVESCENTES','La dosis total de acetaminofen/paracetamol no debe sobrepasar los 80 mg/kg/dia para ninos con un peso menor de 37 kg, y 3 g al dia en adultos y ninos con mas de 38 kg. Puede producir hepatotoxicidad, incluso a dosis terapeuticas, despues de un corto periodo de tratamiento, aun en pacientes sin insuficiencia hepatica. Si luego de tres dias de tratamiento persisten los sintomas acudir a su medico o a una unidad de salud.',true,'RES000009-17#016'),
(17,'ACETAMINOFEN (PARACETAMOL) COMBINADO CON: GUAIFENESINA + CLORFENAMINA MALEATO + FENILEFRINA + (DEXTROMETORFANO o BROMHEXINA)','Hasta 125 mg Acetaminofen + 100 mg Guaifenesina + 5 mg Clorfeniramina + 5 mg Fenilefrina + (15 mg Dextrometorfano o 4 mg Bromhexina) / 5 mL',null,null,false,'JARABE','No superar la dosis recomendada. Usar con precaucion en hipertensos.',true,'RES000009-17#017'),
(18,'ACETAMINOFEN + CARBONATO DE CALCIO + TIAMINA MONONITRATO + CAFEINA ANHIDRA','500 mg + 260 mg + 84 mg + 65 mg',null,null,false,'TABLETA / COMPRIMIDO','No superar la dosis recomendada, si los sintomas persisten luego de 72 horas o empeoran antes acuda a su medico. Puede producir somnolencia.',false,'RES000009-17#018'),
(19,'ACETATO DE ALUMINIO','3 mg / 5 mL (0.030 g/100 mL)',null,null,false,'LOCION','Si persisten los sintomas luego de la dosis recomendada busque atencion medica.',false,'RES000009-17#019'),
(20,'ACETATO DE CALCIO','700 mg',700,'mg',false,'TABLETA / COMPRIMIDOS RECUBIERTAS','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#020'),
(21,'ACETATO DE CALCIO + SULFATO DE ALUMINIO','16.45 g + 51.03 g / 100 g',null,null,false,'POLVO PARA SOLUCION TOPICA','No observaciones.',false,'RES000009-17#021'),
(22,'ACETATO DE ZINC DIHIDRATADO','5 mg / 5 mL',null,null,false,'GEL','Si persisten los sintomas luego de la dosis recomendada busque atencion medica.',false,'RES000009-17#022'),
(23,'ACIDO ACETIL SALICILICO','500 mg',500,'mg',false,'TABLETA / COMPRIMIDOS / CAPLETAS','El alcohol puede incrementar el riesgo de dano gastrointestinal cuando se toma junto con acido acetilsalicilico. Puede producir sangrado de tubo digestivo alto, no ingerir en periodos cercanos a una cirugia por el incremento del riesgo de hemorragia. No usar por mas del tiempo y dosis recomendada. No utilizar en pacientes alergicos al acido acetil salicilico.',false,'RES000009-17#023'),
(24,'ACIDO ACETIL SALICILICO + CAFEINA','Hasta 500 mg de AAS / 65 mg Cafeina',null,null,false,'TABLETA / COMPRIMIDO','El alcohol puede incrementar el riesgo de dano gastrointestinal cuando se toma junto con acido acetilsalicilico. Puede producir sangrado de tubo digestivo alto, no ingerir en periodos cercanos a una cirugia por el incremento del riesgo de hemorragia. No usar por mas del tiempo y dosis recomendada. Este medicamento no debe emplearse como sustituto del sueno. No utilizar en pacientes alergicos al acido acetil salicilico.',false,'RES000009-17#024'),
(25,'ACIDO ACETIL SALICILICO + CAFEINA + BICARBONATO DE SODIO + ACIDO CITRICO','500 mg + 65 mg + 1985 mg + 1000 mg',null,null,false,'TABLETA / CAPLETA / COMPRIMIDO / COMPRIMIDOS EFERVESCENTE','El alcohol puede incrementar el riesgo de dano gastrointestinal cuando se toma junto con acido acetilsalicilico. Puede producir sangrado de tubo digestivo alto, no ingerir en periodos cercanos a una cirugia por el incremento del riesgo de hemorragia. No usar por mas del tiempo y dosis recomendada. Este medicamento no debe emplearse como sustituto del sueno. No utilizar en pacientes alergicos al acido acetil salicilico.',false,'RES000009-17#025'),
(26,'ACIDO ACETIL SALICILICO + CAFEINA + BICARBONATO DE SODIO + ACIDO CITRICO','500 mg + 65 mg + 2000 mg + 2000 mg',null,null,false,'TABLETA / COMPRIMIDO EFERVESCENTE','El alcohol puede incrementar el riesgo de dano gastrointestinal cuando se toma junto con acido acetilsalicilico. Puede producir sangrado de tubo digestivo alto, no ingerir en periodos cercanos a una cirugia por el incremento del riesgo de hemorragia. No usar por mas del tiempo y dosis recomendada. Este medicamento no debe emplearse como sustituto del sueno. No utilizar en pacientes alergicos a la acido acetil salicilico.',false,'RES000009-17#026'),
(27,'ACIDO ACETIL SALICILICO COMBINADO CON: CLORFENIRAMINA MALEATO + DEXTROMETORFANO BROMHIDRATO + FENILEFRINA CLORHIDRATO','Hasta 500 mg AAS + 2 mg Clorfeniramina + 15 mg Dextrometorfano + 10 mg Fenilefrina',null,null,false,'TABLETA / COMPRIMIDO EFERVESCENTE','El alcohol puede incrementar el riesgo de dano gastrointestinal cuando se toma junto con acido acetilsalicilico. Puede producir sangrado de tubo digestivo alto, no ingerir en periodos cercanos a una cirugia por el incremento del riesgo de hemorragia. No usar por mas del tiempo y dosis recomendada. Si despues de 3 dias persisten los sintomas acudir a su medico o a la unidad de salud mas cercana. No utilizar en pacientes alergicos a la acido acetil salicilico.',true,'RES000009-17#027'),
(28,'ACIDO ASCORBICO (VITAMINA C)','2000 mg',2000,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES / CAPSULAS / COMPRIMIDOS EFERVESCENTES','La duracion del tratamiento en general no debe superar 10 dias continuos. Si los sintomas no mejoran o empeoran despues de 7 dias de tratamiento, buscar atencion medica.',true,'RES000009-17#028'),
(29,'ACIDO ASCORBICO (VITAMINA C) + ZINC','1000 mg + 10 mg',null,null,false,'TABLETA / COMPRIMIDO','La duracion del tratamiento en general no debe superar 10 dias continuados. Si los sintomas no mejoran o empeoran despues de 7 dias de tratamiento, buscar atencion medica. Tratamiento de estados carenciales de vitamina C, en adultos y adolescentes a partir de 14 anos.',true,'RES000009-17#029'),
(30,'ACIDO BENZOICO + ACIDO SALICILICO','100 mg + 200 mg / 5 g',null,null,false,'UNGUENTO','Si persisten los sintomas luego de la dosis recomendada busque atencion medica.',false,'RES000009-17#030'),
(31,'ACIDO BORICO','2.75 g / 100 mL',null,null,false,'SOLUCION OTICA','No usar si hay sospecha de infeccion o secreciones. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#031'),
(32,'ACIDO BORICO + CALAMINA + GLICERINA + MENTOL + OXIDO DE ZINC + TALCO','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#032'),
(33,'ACIDO EICOSAPENTAENOICO + ACIDO DOCOSAHEXAENOICO','180 mg + 120 mg',null,null,false,'CAPSULA','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#033'),
(34,'ACIDO FOLICO','5 mg',5,'mg',false,'TABLETA / COMPRIMIDO','No superar la dosis recomendada.',false,'RES000009-17#034'),
(35,'ACIDO FOLICO','5 mg / 5 mL',null,null,false,'JARABE','No superar la dosis recomendada.',false,'RES000009-17#035'),
(36,'ACIDO FOLICO + VITAMINA B 12','5 mg + 500 mcg / 10 mL',null,null,false,'JARABE','No superar la dosis recomendada.',false,'RES000009-17#036'),
(37,'ACIDO SALICILICO','30 g / 100 g',null,null,false,'POMADA / UNGUENTO / GEL','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#037'),
(38,'ACIDO SALICILICO','1 g / 100 mL',null,null,false,'SOLUCION TOPICA','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#038'),
(39,'ACIDO SALICILICO + ACIDO LACTICO','2.0 g + 0.5 g / 10 g',null,null,false,'SOLUCION TOPICA','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#039'),
(40,'ACIDO SALICILICO COMBINADO CON: AZUFRE + SULFATIAZOL','Hasta la concentracion maxima de Acido Salicilico',null,null,false,'POMADA DERMICA','Si persisten los sintomas busque atencion medica.',true,'RES000009-17#040'),
(41,'ACIDO UNDECILENICO','19.06 g / 100 g',null,null,false,'AEROSOL EN SUSPENSION','Si persisten los sintomas busque atencion medica.',false,'RES000009-17#041'),
(42,'AGUA ESTERIL','[ILEGIBLE - celda tachada en el origen]',null,null,true,'SOLUCION ESTERIL','No observaciones.',false,'RES000009-17#042'),
(43,'AGUA OXIGENADA','3% (10 VOLUMENES)',null,null,false,'SOLUCION','Solo para uso externo. No ingerir.',false,'RES000009-17#043'),
(44,'ALBENDAZOL','200 mg',200,'mg',false,'TABLETA / COMPRIMIDO','No se debe administrar albendazol durante el embarazo o en mujeres que se sospeche embarazo. Consulte a su medico.',false,'RES000009-17#044'),
(45,'ALBENDAZOL','400 mg / 10 mL',null,null,false,'SUSPENSION ORAL','No se debe administrar albendazol durante el embarazo o en mujeres que se sospeche embarazo. Consulte a su medico. Ninos entre 1-2 anos la dosis es de 200 mg. Una dosis. Consulte a su medico.',false,'RES000009-17#045'),
(46,'ALCANFOR','[ILEGIBLE - celda tachada en el origen]',null,null,true,'POMADA / CREMA','No ingerir.',false,'RES000009-17#046'),
(47,'ALCANFOR + TREMENTINA + MENTOL + ACEITE ESENCIAL DE EUCALIPTO + TIMOL','[ILEGIBLE - celda tachada en el origen]',null,null,true,'UNGUENTO','No ingerir.',false,'RES000009-17#047'),
(48,'ALCOHOL ETILICO','70 % V/V',null,null,false,'SOLUCION','Solo para uso externo. No ingerir.',false,'RES000009-17#048'),
(49,'ALCOHOL ISOPROPILICO','70 % V/V',null,null,false,'SOLUCION DE USO TOPICO','Solo para uso externo. No ingerir.',false,'RES000009-17#049'),
(50,'ALFA - AMILASA','3000 U.CEIP',null,null,false,'TABLETA / COMPRIMIDOS GRAGEADOS','No superar la dosis recomendada.',false,'RES000009-17#050'),
(51,'ALFA - AMILASA','1000 U CEIP / 5 mL',null,null,false,'JARABE','No superar la dosis recomendada.',false,'RES000009-17#051'),
(52,'ALGINATO DE SODIO + BICARBONATO DE SODIO','2.67 g - 2.50 g / 100 mL',null,null,false,'SUSPENSION ORAL','No superar la dosis recomendada.',false,'RES000009-17#052'),
(53,'AMBROXOL CLORHIDRATO','30 mg',30,'mg',false,'TABLETA / COMPRIMIDO / CAPLETA','No administrar a ninos menores de 2 anos. Si los sintomas persisten despues de 5 dias se debe acudir al medico o a la unidad de salud mas cercana.',false,'RES000009-17#053'),
(54,'AMBROXOL CLORHIDRATO','30 mg / 5 mL',null,null,false,'SOLUCION ORAL / JARABE','No administrar a ninos menores de 2 anos. Si los sintomas persisten despues de 5 dias se debe acudir al medico o a la unidad de salud mas cercana.',false,'RES000009-17#054'),
(55,'AMBROXOL CLORHIDRATO','7.5 mg / mL',null,null,false,'SOLUCION ORAL GOTAS','No administrar a ninos menores de 2 anos. Si los sintomas persisten despues de 5 dias se debe acudir al medico o a la unidad de salud mas cercana.',false,'RES000009-17#055'),
(56,'AMBROXOL CLORHIDRATO','75 mg',75,'mg',false,'CAPSULA DE LIBERACION PROLONGADA','No administrar a ninos menores de 2 anos. Si los sintomas persisten despues de 5 dias se debe acudir al medico o a la unidad de salud mas cercana.',false,'RES000009-17#056'),
(57,'AZUFRE','10 g / 100 g',null,null,false,'JABON','No ingerir. Suspender si produce irritacion.',false,'RES000009-17#057'),
(58,'BENZALCONIO CLORURO','10 g / 100 g',null,null,false,'PASTA JABON','No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#058'),
(59,'BENZALCONIO CLORURO','0.5 g / 100 mL',null,null,false,'SOLUCION TOPICA','No ingerir. Solo para uso externo.',false,'RES000009-17#059'),
(60,'BENZOCAINA','20 mg / mL',null,null,false,'SOLUCION OTICA','No aplicar en sospecha de infeccion o si hay secreciones a traves del oido. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#060'),
(61,'BENZOCAINA + CLORURO DE DECUALINIO','10 mg + 0.25 mg',null,null,false,'PASTILLA','No superar la dosis recomendada. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#061'),
(62,'BENZOCAINA + CLORHEXIDINA DIHIDROCLORURO','2 mg + 5 mg',null,null,false,'TABLETA / COMPRIMIDOS MASTICABLES','No superar la dosis recomendada.',false,'RES000009-17#062'),
(63,'BENZOCAINA + TRICLOSAN','0.500 g + 0.200 g / 100 mL',null,null,false,'LOCION TOPICA','No ingerir. No superar la dosis recomendada.',false,'RES000009-17#063'),
(64,'BICARBONATO DE SODIO','2.3 g / 5 g',null,null,false,'POLVO EFERVESCENTE PARA SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#064'),
(65,'BICARBONATO DE SODIO + ALGINATO DE SODIO','125 mg + 133.5 mg / 5 mL',null,null,false,'SUSPENSION ORAL','No superar la dosis recomendada.',false,'RES000009-17#065'),
(66,'BICARBONATO DE SODIO + SULFATO DE MAGNESIO','2.3 g + 0.9 g / 5 g',null,null,false,'POLVO EFERVESCENTE PARA SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#066'),
(67,'BICARBONATO DE SODIO + ACIDO CITRICO + CARBONATO SODICO','2.3 g + 2.19 g + 0.45 g / 5 g',null,null,false,'POLVO EFERVESCENTE PARA SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#067'),
(68,'BROMHEXINA CLORHIDRATO','8 mg',8,'mg',false,'TABLETA / COMPRIMIDO / CAPSULAS BLANDAS','No usar en menores de 2 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#068'),
(69,'BROMHEXINA CLORHIDRATO','8 mg / 5 mL',null,null,false,'JARABE','No usar en menores de 2 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#069'),
(70,'CALAMINA','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','No ingerir. No superar la dosis recomendada.',false,'RES000009-17#070'),
(71,'CALAMINA + DIFENHIDRAMINA','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','No ingerir. No superar la dosis recomendada.',false,'RES000009-17#071'),
(72,'CALAMINA + OXIDO DE ZINC','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','No ingerir. No superar la dosis recomendada.',false,'RES000009-17#072'),
(73,'CALAMINA + OXIDO DE ZINC + DIFENHIDRAMINA','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','No ingerir. No superar la dosis recomendada.',false,'RES000009-17#073'),
(74,'CALCIO GLUCONATO','600 mg',600,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#074'),
(75,'CALCIO CARBONATO','90 g / 100 g',null,null,false,'POLVO','No superar la dosis recomendada, no usar en problemas renales sin autorizacion medica.',false,'RES000009-17#075'),
(76,'CARBOMER','2.50 mg/g',null,null,false,'GEL OFTALMICO','No superar la dosis recomendada.',false,'RES000009-17#076'),
(77,'CARBOMERO + MANITOL','0.150 g + 4.600 g / g',null,null,false,'GEL OFTALMICO','No superar la dosis recomendada.',false,'RES000009-17#077'),
(78,'CARBONATO DE CALCIO + VITAMINA D3','1500 mg + 400 UI',null,null,false,'TABLETA / COMPRIMIDO / CAPLETAS / CAPSULAS','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#078'),
(79,'CARBONATO DE CALCIO','1500 mg',1500,'mg',false,'TABLETA / COMPRIMIDO / CAPLETAS / CAPSULAS','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#079'),
(80,'CETIRIZINA DICLORHIDRATO','10 mg',10,'mg',false,'CAPSULA / TABLETA / COMPRIMIDOS / CAPLETAS','Precaucion al usarse conjuntamente con alcohol. No usar en ninos menores de 6 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#080'),
(81,'CETIRIZINA DICLORHIDRATO','5 mg / 5 mL',null,null,false,'JARABE','No usar en ninos menores de 6 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#081'),
(82,'CITRATO DE CALCIO','1500 mg',1500,'mg',false,'TABLETA / COMPRIMIDO / CAPLETAS / CAPSULAS','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#082'),
(83,'CITRATO DE CALCIO + VITAMINA D3','1500 mg + 400 UI',null,null,false,'TABLETA / COMPRIMIDO / CAPLETAS / CAPSULAS','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#083'),
(84,'CITRATO POTASICO','1080 mg',1080,'mg',false,'TABLETA / COMPRIMIDO DE LIBERACION PROLONGADA','No superar la dosis recomendada. No usar con problemas renales o cardiacos sin prescripcion medica.',false,'RES000009-17#084'),
(85,'CLONIXINATO DE LISINA','125 mg',125,'mg',false,'CAPSULA / TABLETA / COMPRIMIDOS','No usar en menores de 18 anos. No superar la dosis recomendada.',false,'RES000009-17#085'),
(86,'CLORURO DE OXIBUPROCAINA + CLORURO DE CETILPIRIDINO','0.20000 mg + 1.00000 mg',null,null,false,'TABLETA / COMPRIMIDO','No superar la dosis recomendada. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#086'),
(87,'CLORURO DE SODIO','70 mg / mL',null,null,false,'SOLUCION NASAL / SOLUCION SPRAY NASAL / SOLUCION PARA INHALACION','En caso de sospecha de infeccion o si los sintomas persisten luego de 48 horas acudir al medico.',false,'RES000009-17#087'),
(88,'CLOTRIMAZOL','2 g / 100 g',null,null,false,'CREMA TOPICA / GEL','Si los sintomas persisten consultar a su medico. Evitar el contacto del producto con ojos y mucosas. No ingerir.',false,'RES000009-17#088'),
(89,'CLOTRIMAZOL','500 mg',500,'mg',false,'OVULO VAGINAL / TABLETA / COMPRIMIDO VAGINAL','Se debe consultar a un medico si los sintomas durante el tratamiento se mantienen despues de 3 dias o se observa aumento del flujo vaginal o cambios en su aspecto u olor, o sangrado.',false,'RES000009-17#089'),
(90,'CLOTRIMAZOL','1 g / 100 mL',null,null,false,'SOLUCION DE USO TOPICO / SOLUCION ATOMIZADORA','Si los sintomas persisten consultar a su medico. Evitar el contacto del producto con ojos y mucosas. No ingerir.',false,'RES000009-17#090'),
(91,'CLOTRIMAZOL','2 g / 100 g',null,null,false,'JABON PASTA','Si los sintomas persisten consultar a su medico. Evitar el contacto del producto con ojos y mucosas. No ingerir.',false,'RES000009-17#091'),
(92,'CLOTRIMAZOL','2 g / 100 g (2%)',null,null,false,'CREMA VAGINAL / GEL','Se debe consultar a un medico si los sintomas durante el tratamiento se mantienen despues de 3 dias o se observa aumento del flujo vaginal o cambios en su aspecto u olor, o sangrado.',false,'RES000009-17#092'),
(93,'CLOTRIMAZOL COMBINADO CON: PARACLOROXILENOL + DIFENHIDRAMINA + VITAMINA A + VITAMINA D3 + AVENA','Hasta concentracion maxima del 1% para el Clotrimazol',null,null,false,'JABON PASTA','Si los sintomas persisten consultar a su medico. Evitar el contacto del producto con ojos y mucosas. No ingerir.',true,'RES000009-17#093'),
(94,'DEXTROMETORFAN','15 mg / 5 mL',null,null,false,'JARABE','No utilizar este medicamento en caso de tos persistente o cronica, como la debida al tabaco, ya que puede deteriorar la expectoracion y aumentar asi la resistencia de las vias respiratorias. No usar de manera prolongada. No usar en ninos menores de 12 anos salvo que sea indicado por un medico. Si los sintomas persisten consulte a su medico.',false,'RES000009-17#094'),
(95,'DEXTROMETORFANO','30 mg',30,'mg',false,'TABLETAS / COMPRIMIDOS','No utilizar este medicamento en caso de tos persistente o cronica, como la debida al tabaco, ya que puede deteriorar la expectoracion y aumentar asi la resistencia de las vias respiratorias. No usar de manera prolongada. No usar en ninos menores de 12 anos salvo que sea indicado por un medico. Si los sintomas persisten consulte a su medico.',false,'RES000009-17#095'),
(96,'DEXTROMETORFANO + GUAIFENESINA','30 mg + 200 mg',null,null,false,'CAPLETA','No utilizar este medicamento en caso de tos persistente o cronica, como la debida al tabaco, ya que puede deteriorar la expectoracion y aumentar asi la resistencia de las vias respiratorias. No usar de manera prolongada. No usar en ninos menores de 12 anos salvo que sea indicado por un medico.',false,'RES000009-17#096'),
(97,'DEXTROMETORFANO BROMHIDRATO + CLORFENIRAMINA MALEATO','30 mg + 4 mg',null,null,false,'TABLETA / COMPRIMIDO','No utilizar este medicamento en caso de tos persistente o cronica, como la debida al tabaco, ya que puede deteriorar la expectoracion y aumentar asi la resistencia de las vias respiratorias. No usar de manera prolongada. No usar en ninos menores de 12 anos salvo que sea indicado por un medico. Si despues de 3 dias persisten los sintomas o empeoran acudir a un medico. Si los sintomas persisten consulte a su medico.',false,'RES000009-17#097'),
(98,'DEXTROMETORFANO BROMHIDRATO + MIEL DE ABEJA + CLORFENIRAMINA','15 mg + 350 mg + 5 mg / 5 mL',null,null,false,'JARABE','No utilizar este medicamento en caso de tos persistente o cronica, como la debida al tabaco, ya que puede deteriorar la expectoracion y aumentar asi la resistencia de las vias respiratorias. No usar de manera prolongada. No usar en ninos menores de 12 anos salvo que sea indicado por un medico.',false,'RES000009-17#098'),
(99,'DICLOFENAC DIETILAMONIO','1 g / 100 g',null,null,false,'GEL TOPICO','Solo uso topico. Si sintomas persisten consulte a su medico.',false,'RES000009-17#099'),
(100,'DICLOFENAC SODICO','1 g / 100 g',null,null,false,'GEL TOPICO','Solo uso topico. Si los sintomas persisten consulte a su medico.',false,'RES000009-17#100'),
(101,'DIFENHIDRAMINA','50 mg',50,'mg',false,'TABLETA / COMPRIMIDO','Produce sedacion, tomar antes de dormir, no debera ser administrada durante un periodo superior a 7 dias, ni a menores de 12 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#101'),
(102,'DIFENHIDRAMINA','12.5 mg / 5 mL',null,null,false,'JARABE / SOLUCION ORAL','Produce sedacion, tomar antes de dormir, no debera ser administrada durante un periodo superior a 7 dias, ni a menores de 12 anos. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#102'),
(103,'DIFENHIDRAMINA CLORHIDRATO + CLORHIDRATO DE FENILEFRINA','12.50 mg + 5 mg / 5 mL',null,null,false,'JARABE','Produce sedacion. No administrar a ninos menores de 12 anos. Por la fenilefrina usar con precaucion en hipertensos y cardiopatas. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#103'),
(104,'DIGLUCONATO DE CLORHEXIDINA','20 %',null,null,false,'GEL','Solo uso topico. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#104'),
(105,'DIMENHIDRINATO','50 mg',50,'mg',false,'TABLETA / COMPRIMIDO','No debe utilizarse en ninos menores de 2 anos. Puede producir sueno. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#105'),
(106,'DIMENHIDRINATO','25 mg',25,'mg',false,'SUPOSITORIO','No debe utilizarse en ninos menores de 2 anos. Puede producir sueno. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#106'),
(107,'DIMENHIDRINATO','15 mg / 5 mL',null,null,false,'JARABE / SOLUCION ORAL','No debe utilizarse en ninos menores de 2 anos. Puede producir sueno. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#107'),
(108,'ESPORAS DE BACILLUS CLAUSII','2 Millardos (2 Billones)',null,null,false,'CAPSULA','No superar la dosis recomendada.',false,'RES000009-17#108'),
(109,'ESPORAS DE BACILLUS CLAUSII','2 Billones / 5 mL',null,null,false,'SUSPENSION ORAL','No superar la dosis recomendada.',false,'RES000009-17#109'),
(110,'EXTRACTO DE CAMOMILA','0.25 mg / mL',null,null,false,'SOLUCION OFTALMICA ESTERIL','No superar la dosis recomendada.',false,'RES000009-17#110'),
(111,'EXTRACTO DE FLUIDO DE RUIBARBO + ACIDO SALICILICO','50 mg + 10 mg / mL',null,null,false,'SOLUCION TOPICA','No superar la dosis recomendada.',false,'RES000009-17#111'),
(112,'EXTRACTO DE GINGKO BILOBA','80 mg',80,'mg',false,'TABLETA / COMPRIMIDOS RECUBIERTOS','No superar la dosis recomendada. No usar conjuntamente acido acetil salicilico o cualquier otro antiplaquetario, para evitar el riesgo de sangrado.',false,'RES000009-17#112'),
(113,'EXTRACTO DE HOJA DE HIEDRA DESECADA (HEDERA HELIX)','7.0 mg / mL',null,null,false,'JARABE','No superar la dosis recomendada.',true,'RES000009-17#113'),
(114,'EXTRACTO ESTANDARIZADO DE GINKGO BILOBA','40 mg / mL',null,null,false,'SOLUCION GOTAS','No superar la dosis recomendada. No usar conjuntamente acido acetil salicilico o cualquier otro antiplaquetario, para evitar el riesgo de sangrado.',false,'RES000009-17#114'),
(115,'EXTRACTO TITULADO DE CENTELLA ACUATICA','2 g / 100 g',null,null,false,'POLVO','No superar la dosis recomendada.',false,'RES000009-17#115'),
(116,'EXTRACTO TITULADO DE CENTELLA ACUATICA','2 g / 100 g',null,null,false,'CREMA TOPICA','No superar la dosis recomendada.',false,'RES000009-17#116'),
(117,'FOSFATO DE CALCIO TRIBASICO','5.0 g / 100 g',null,null,false,'GRANULADO','No usar si hay problemas renales o cardiacos.',false,'RES000009-17#117'),
(118,'GLICERINA','1.2 g / SUPOSITORIO NINOS',null,null,false,'SUPOSITORIO','No usar en menores de dos anos.',false,'RES000009-17#118'),
(119,'GLICERINA','2.4 g / SUPOSITORIO ADULTOS',null,null,false,'SUPOSITORIO','No usar en menores de dos anos.',false,'RES000009-17#119'),
(120,'GLUCONATO FERROSO','300 mg / 10 mL',null,null,false,'SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#120'),
(121,'GLUCOSAMINA + SULFATO DE CONDROITINA + METIL SUFONIL METANO','500 mg + 400 mg + 300 mg',null,null,false,'TABLETA / COMPRIMIDO','No superar la dosis recomendada.',false,'RES000009-17#121'),
(122,'GOTU KOLA','500 mg',500,'mg',false,'CAPSULA','No superar la dosis recomendada.',false,'RES000009-17#122'),
(123,'HIDROTALCITA','500 mg',500,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES','No superar la dosis recomendada.',false,'RES000009-17#123'),
(124,'HIDROXIDO DE ALUMINIO + HIDROXIDO DE MAGNESIO + SIMETICONA','520 mg + 480 mg + 40 mg / 5 mL',null,null,false,'SUSPENSION ORAL','No administrar en menores de 15 anos. Si luego de tres dias persisten los sintomas se debe acudir a un medico o a la unidad de salud mas cercana. No administrar en personas con estrenimiento.',false,'RES000009-17#124'),
(125,'HIDROXIDO DE ALUMINIO + HIDROXIDO DE MAGNESIO + SIMETICONA','520 mg + 480 mg + 40 mg',null,null,false,'TABLETA / COMPRIMIDO MASTICABLE','No administrar en menores de 15 anos. Si luego de tres dias persisten los sintomas se debe acudir a un medico o a la unidad de salud mas cercana. No administrar en personas con estrenimiento.',false,'RES000009-17#125'),
(126,'HIDROXIDO DE MAGNESIO','480 mg / 5 mL',null,null,false,'SUSPENSION ORAL','No usar de manera cronica. No usar como laxante en ninos.',false,'RES000009-17#126'),
(127,'HIDROXIDO DE MAGNESIO + OXIDO DE MAGNESIO','1.08 g + 4.68 g / 8 g',null,null,false,'POLVO PARA SUSPENSION ORAL','No administrar en menores de 15 anos. Si luego de tres dias persisten los sintomas se debe acudir a un medico o a la unidad de salud mas cercana. No administrar en personas con estrenimiento.',false,'RES000009-17#127'),
(128,'HIDROXIPROPIL GUAR','6 mg / mL',null,null,false,'SOLUCION OFTALMICA','No superar la dosis recomendada.',false,'RES000009-17#128'),
(129,'HIDROXIPROPIL METIL CELULOSA + DEXTRAN','3 mg + 1 mg / mL',null,null,false,'SOLUCION OFTALMICA','No superar la dosis recomendada.',false,'RES000009-17#129'),
(130,'HIERRO COMO COMPLEJO DE HIERRO III','100 mg',100,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES','No superar la dosis recomendada.',false,'RES000009-17#130'),
(131,'IBUPROFENO','100 mg / 5 mL',null,null,false,'SUSPENSION','No usar en ninos menores de dos anos. En los ninos mayores de dos anos no usar por mas de 48 horas. Puede producir problemas gastrointestinales, renales y hepaticos.',false,'RES000009-17#131'),
(132,'IBUPROFENO','400 mg',400,'mg',false,'CAPLETA / GRAGEA / TABLETA / COMPRIMIDOS / CAPSULA','No usar conjuntamente con otros analgesicos, su uso prolongado puede producir problemas gastrointestinales o hepaticos. No ingerir mas de 1200 mg al dia.',false,'RES000009-17#132'),
(133,'IBUPROFENO','100 mg',100,'mg',false,'SUPOSITORIO','No usar conjuntamente con otros analgesicos, su uso prolongado puede producir problemas gastrointestinales o hepaticos.',false,'RES000009-17#133'),
(134,'IBUPROFENO','10 g / 100 g',null,null,false,'GEL','Si persisten los sintomas busque ayuda medica.',false,'RES000009-17#134'),
(135,'IBUPROFENO','50 mg / mL',null,null,false,'GOTAS ORALES EN SUSPENSION','No usar en ninos menores de dos anos. En los ninos mayores de dos anos no usar por mas de 48 horas. Puede producir problemas gastrointestinales, renales y hepaticos.',false,'RES000009-17#135'),
(136,'IBUPROFENO + N-BUTILBROMURO DE HIOSCINA','400 mg + 20 mg',null,null,false,'TABLETA / COMPRIMIDOS RECUBIERTAS','No usar en ninos menores de 2 anos. Puede producir problemas gastrointestinales, renales y hepaticos.',false,'RES000009-17#136'),
(137,'IBUPROFENO COMBINADO CON: VITAMINA B1 + VITAMINA B6 + VITAMINA B12 + IBUPROFENO','Hasta 400 mg de Ibuprofeno + 50 mg Vitamina B1 + 100 mg Vitamina B6 + 100 mcg Vitamina B12',null,null,false,'CAPLETA','No superar la dosis recomendada. Si los sintomas persisten consultar a su medico.',true,'RES000009-17#137'),
(138,'IBUPROFENO + CAFEINA','Hasta 400 mg Ibuprofeno / 65 mg Cafeina',null,null,false,'CAPSULA','No usar conjuntamente con otros analgesicos, su uso prolongado puede producir problemas gastrointestinales o hepaticos. No ingerir mas de 1200 mg al dia.',false,'RES000009-17#138'),
(139,'LACTOBACILLUS ACIDOPHILUS','170 mg',170,'mg',false,'POLVO PARA SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#139'),
(140,'LACTOBACILLUS ACIDOPHILUS','170 mg',170,'mg',false,'CAPSULA','No superar la dosis recomendada.',false,'RES000009-17#140'),
(141,'LACTULOSA','3.33 g / 5 mL',null,null,false,'SOLUCION ORAL','En caso de efecto terapeutico insuficiente despues de varios dias de tratamiento, se aconseja consultar al medico.',false,'RES000009-17#141'),
(142,'LEVONORGESTREL','1.5 mg',1.5,'mg',false,'TABLETA / COMPRIMIDO','Es un anticonceptivo de emergencia, no usar como metodo de planificacion familiar de rutina. Debe ingerirse preferiblemente antes de las 72 horas despues del coito, entre mas cerca de la hora del coito es mas eficaz. Puede tomarse hasta el 5 dia (120 horas) pero la eficacia se reduce.',false,'RES000009-17#142'),
(143,'LIDOCAINA','5 g / 100 g',null,null,false,'GEL TOPICO / UNGUENTO TOPICO','No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#143'),
(144,'LIDOCAINA','100 mg / mL',null,null,false,'SPRAY','No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#144'),
(145,'LOPERAMIDA','2 mg',2,'mg',false,'TABLETA / COMPRIMIDO','No usar en menores de 12 anos. La dosis maxima es de 16 mg al dia. Si luego de 2 dias persisten los sintomas buscar atencion medica. La medida terapeutica mas importante es la administracion de fluidos apropiados y la reposicion de electrolitos (Sales de Rehidratacion Oral).',false,'RES000009-17#145'),
(146,'LOPERAMIDA','2 mg / mL',null,null,false,'SOLUCION GOTAS ORALES','No usar en ninos menores de 12 anos. La dosis maxima es de 16 mg al dia. Si luego de 2 dias persisten los sintomas buscar atencion medica. La medida terapeutica mas importante es la administracion de liquidos apropiados y la reposicion de electrolitos (Sales de Rehidratacion Oral).',false,'RES000009-17#146'),
(147,'LORATADINA','10 mg',10,'mg',false,'TABLETA / COMPRIMIDO','Si el paciente empeora o los sintomas persisten despues de 7 dias de tratamiento, debe evaluarse la situacion clinica del paciente.',false,'RES000009-17#147'),
(148,'LORATADINA','5 mg / 5 mL',null,null,false,'JARABE / SOLUCION ORAL','Si el paciente empeora o los sintomas persisten despues de 7 dias de tratamiento, debe evaluarse la situacion clinica del paciente.',false,'RES000009-17#148'),
(149,'LORATADINA','1 mg / mL',null,null,false,'SOLUCION GOTAS','Si el paciente empeora o los sintomas persisten despues de 7 dias de tratamiento, debe evaluarse la situacion clinica del paciente.',false,'RES000009-17#149'),
(150,'LORATADINA / FENILEFRINA','5 mg + 5 mg / 5 mL',null,null,false,'JARABE','Si el paciente empeora o los sintomas persisten despues de 7 dias de tratamiento, consulte a su medico. No usar en hipertensos y cardiopatas.',false,'RES000009-17#150'),
(151,'MAGALDRATO + SIMETICONA','400 mg + 30 mg / 5 mL',null,null,false,'SUSPENSION','Evitar el uso prolongado. Si persisten los sintomas buscar atencion medica.',false,'RES000009-17#151'),
(152,'MAGALDRATO + SIMETICONA','800 mg + 40 mg',null,null,false,'COMPRIMIDO MASTICABLE','Si persisten los sintomas buscar atencion medica.',false,'RES000009-17#152'),
(153,'MECOBALAMINA','500 mcg',500,'mcg',false,'TABLETA / COMPRIMIDOS','No superar la dosis recomendada.',false,'RES000009-17#153'),
(154,'MELATONINA','3 mg',3,'mg',false,'CAPSULA','Produce somnolencia.',false,'RES000009-17#154'),
(155,'MENTOL','[ILEGIBLE - celda tachada en el origen]',null,null,true,'UNGUENTO / CREMA','No ingerir.',false,'RES000009-17#155'),
(156,'MENTOL + SALICILATO DE METILO + EUCALIPTO','[ILEGIBLE - celda tachada en el origen]',null,null,true,'UNGUENTO / CREMA','No ingerir.',false,'RES000009-17#156'),
(157,'MENTOL + EXTO. FLUIDO DE TOLU + BENJUI + EUCALIPTO + GOMENOL','1 g + 10 mL + 10 mL + 10 mL + 1 mL / 100 mL',null,null,false,'SOLUCION INHALANTE','No ingerir.',false,'RES000009-17#157'),
(158,'MICONAZOL','400 mg',400,'mg',false,'OVULO','Si los sintomas persisten consultar a su medico.',false,'RES000009-17#158'),
(159,'MICONAZOL','2 g / 100 mL',null,null,false,'SOLUCION TOPICA','No utilizar en ninos menores de 2 anos. Si persisten los sintomas luego de 5 dias buscar atencion medica.',false,'RES000009-17#159'),
(160,'MICONAZOL','2 g / 100 g',null,null,false,'CREMA TOPICA','No utilizar en ninos menores de 2 anos. Si persisten los sintomas luego de 5 dias buscar atencion medica.',false,'RES000009-17#160'),
(161,'MICONAZOL','2 g / 100 g',null,null,false,'CREMA VAGINAL','No utilizar en ninos menores de 2 anos. Si persisten los sintomas luego de 5 dias buscar atencion medica.',false,'RES000009-17#161'),
(162,'MICONAZOL','2 g / 100 g',null,null,false,'POLVO','No utilizar en ninos menores de 2 anos. Si persisten los sintomas luego de 5 dias buscar atencion medica.',false,'RES000009-17#162'),
(163,'NAPROXENO SODICO','275 mg',275,'mg',false,'CAPSULA / TABLETA / COMPRIMIDOS','Uso en mayores de 16 anos, la dosis maxima es de 600 mg. Puede incrementar riesgo de problemas hepaticos, renales y gastrointestinales. No usar conjuntamente con otros analgesicos, sin prescripcion medica.',false,'RES000009-17#163'),
(164,'NAPROXENO SODICO','5.5 g / 100 g',null,null,false,'GEL TOPICO','Uso en mayores de 16 anos, la dosis maxima es de 600 mg. Puede incrementar riesgo de problemas hepaticos, renales y gastrointestinales. No usar conjuntamente con otros analgesicos, sin prescripcion medica.',false,'RES000009-17#164'),
(165,'NICOTINA RESINATO','10 mg (Equiv. A 4 mg de Nicotina)',10,'mg',false,'TABLETA / COMPRIMIDOS DE GOMA MASTICABLE','No usar en menores de 18 anos sin prescripcion medica.',false,'RES000009-17#165'),
(166,'NISTATINA','100,000 UI',null,null,false,'CREMA TOPICA','No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#166'),
(167,'OMEGA 3','1200 mg',1200,'mg',false,'CAPSULAS BLANDAS DE GELATINA','No superar la dosis recomendada.',false,'RES000009-17#167'),
(168,'OXIDO DE ZINC','[ILEGIBLE - celda tachada en el origen]',null,null,true,'LOCION','No ingerir.',false,'RES000009-17#168'),
(169,'OXIDO DE ZINC','[ILEGIBLE - celda tachada en el origen]',null,null,true,'CREMA DERMICA','No ingerir.',false,'RES000009-17#169'),
(170,'OXIMETAZOLINA','0.50 mg / mL',null,null,false,'SOLUCION NASAL','No usar en menores de 6 anos. No superar la dosis recomendada. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#170'),
(171,'OXIMETAZOLINA + DEXPANTENOL','0.50 mg + 20.33 mg / 3 mL',null,null,false,'SOLUCION NASAL','No usar en menores de 6 anos. No superar la dosis recomendada. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#171'),
(172,'PANCREATINA','400 mg',400,'mg',false,'CAPSULA / TABLETAS / GRAGEAS / COMPRIMIDOS','No superar la dosis recomendada. Si los sintomas persisten por mas de 5 dias consultar a su medico.',false,'RES000009-17#172'),
(173,'PANCREATINA + DIMETILPOLISILOXANO + BROMOPRIDE','400 mg + 80 mg + 5 mg',null,null,false,'CAPSULA / TABLETAS / GRAGEAS / COMPRIMIDOS','No superar la dosis recomendada. Si los sintomas persisten por mas de 5 dias consultar a su medico.',false,'RES000009-17#173'),
(174,'PANCREATINA + SIMETICONA','600 mg + 80 mg',null,null,false,'CAPSULA / TABLETAS / GRAGEAS / COMPRIMIDOS','No superar la dosis recomendada. Si los sintomas persisten por mas de 5 dias consultar a su medico.',false,'RES000009-17#174'),
(175,'PERMETRINA','1 g / 100 mL',null,null,false,'SHAMPOO / LOCION','No ingerir.',false,'RES000009-17#175'),
(176,'PEROXIDO DE BENZOILO','5 g / 100 g',null,null,false,'JABON PASTA','No ingerir.',false,'RES000009-17#176'),
(177,'PEROXIDO DE BENZOILO','5 g / 100 g',null,null,false,'GEL','No ingerir.',false,'RES000009-17#177'),
(178,'PIRIDOXINA + DOXILAMINA','10 mg + 10 mg',null,null,false,'TABLETA / COMPRIMIDOS ENTERICOS','No superar la dosis recomendada.',false,'RES000009-17#178'),
(179,'PIROXICAM','0.5 g / 100 g',null,null,false,'GEL','Si persisten los sintomas buscar atencion medica.',false,'RES000009-17#179'),
(180,'POLIETILENGLICOL 400 + PROPILENGLICOL','4.0 mg + 3.0 mg / 1 mL',null,null,false,'SOLUCION OFTALMICA ESTERIL','No superar la dosis recomendada. Si persisten los sintomas buscar atencion medica.',false,'RES000009-17#180'),
(181,'PRAMOXINA + ACETATO DE ZINC','1 g + 0.1 g / 100 mL',null,null,false,'LOCION','No ingerir.',false,'RES000009-17#181'),
(182,'RUSCUS ACULEATUS + ACIDO ASCORBICO (VITAMINA C) + LACTOBACILLUS SPOROGENES','20.00 mg + 40.00 mg + 8.300 mg',null,null,false,'TABLETA / COMPRIMIDOS MASTICABLES','No superar la dosis recomendada.',true,'RES000009-17#182'),
(183,'SACCHAROMYCES BOULARDII','200 mg',200,'mg',false,'CAPSULA','No superar la dosis recomendada.',false,'RES000009-17#183'),
(184,'SACCHAROMYCES BOULARDII','250 mg',250,'mg',false,'POLVO PARA SUSPENSION / SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#184'),
(185,'SALES DE REHIDRATACION ORAL','SEGUN FORMULA OMS: POR CADA LITRO (1000 mL) CLORURO DE SODIO 2.6 g / GLUCOSA ANHIDRA 13.5 g / CLORURO DE POTASIO 1.5 g / CITRATO TRISODICO 2.9 g',null,null,false,'POLVO PARA SOLUCION ORAL / SOLUCION ORAL','Si persiste la diarrea luego de 24 horas, se incrementan las deposiciones o presenta fiebre o datos de deshidratacion acudir al medico.',false,'RES000009-17#185'),
(186,'SILIMARINA','200 mg',200,'mg',false,'TABLETA / COMPRIMIDO / CAPSULA / GRAGEA','Para ingesta por largos periodos de tiempo requiere indicacion medica.',false,'RES000009-17#186'),
(187,'SIMETICONA','Hasta 125 mg',125,'mg',false,'TABLETA / COMPRIMIDOS MASTICABLES','Si los sintomas persisten consultar a su medico.',false,'RES000009-17#187'),
(188,'SIMETICONA','Hasta 100 mg / mL',null,null,false,'SUSPENSION / SUSPENSION EN GOTAS','Si los sintomas persisten consultar a su medico.',false,'RES000009-17#188'),
(189,'SUBSALICILATO DE BISMUTO','87.33 mg / 5 mL',null,null,false,'SUSPENSION ORAL','No superar la dosis recomendada. Si los sintomas persisten consultar a su medico. No utilizar en pacientes alergicos a la acido acetil salicilico.',false,'RES000009-17#189'),
(190,'SULFADIAZINA DE PLATA','1 g / 100 g',null,null,false,'CREMA','No ingerir, uso topico.',false,'RES000009-17#190'),
(191,'SULFADIAZINA DE PLATA','1 g / 100 g',null,null,false,'POLVO','No ingerir, uso topico.',false,'RES000009-17#191'),
(192,'SULFADIAZINA DE PLATA + PRAMOXINA + OXIDO DE ZINC + VITAMINA A + VITAMINA E','10 mg + 10 mg + 100 mg + 250 U.I. + 30 U.I. / g',null,null,false,'CREMA TOPICA','No ingerir, uso topico.',false,'RES000009-17#192'),
(193,'TETRAHIDROZOLINA','0.50 mg / mL',null,null,false,'SOLUCION OFTALMICA','Uso en ninos mayores de 6 anos no superar la dosis recomendada, si persisten los sintomas consulte a su medico. No utilizar con pacientes con glaucoma.',false,'RES000009-17#193'),
(194,'TOLNAFTATO','1 g / 100 mL',null,null,false,'SOLUCION','Uso topico. No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#194'),
(195,'TOLNAFTATO','1 g / 100 g',null,null,false,'POLVO','Uso topico. No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#195'),
(196,'TOLNAFTATO','1 g / 100 g',null,null,false,'CREMA','Uso topico. No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#196'),
(197,'TOLNAFTATO + ALANTOINA','1 g + 0.2 g / 100 g',null,null,false,'POLVO','Uso topico. No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#197'),
(198,'TRICLOSAN','0.1 g / 100 g',null,null,false,'POLVO','Uso topico. No ingerir. Si los sintomas persisten consultar a su medico.',false,'RES000009-17#198'),
(199,'VITAMINA A PALMITATO + VITAMINA D3 + OXIDO DE ZINC','[ILEGIBLE - celda tachada en el origen]',null,null,true,'UNGUENTO / CREMA','No superar la dosis recomendada.',false,'RES000009-17#199'),
(200,'VITAMINA B1 + VITAMINA B6 + VITAMINA B12','50 mg + 50 mg + 200 mcg / 15 mL',null,null,false,'JARABE','No superar la dosis recomendada.',false,'RES000009-17#200'),
(201,'VITAMINA B1 + VITAMINA B6 + VITAMINA B12','100 mg + 100 mg + 200 mcg',null,null,false,'TABLETA / COMPRIMIDOS RECUBIERTAS / CAPSULAS / CAPLETAS','No superar la dosis recomendada.',false,'RES000009-17#201'),
(202,'VITAMINA B12 + ACIDO FOLICO','0.50 mg + 5.0 mg',null,null,false,'TABLETA / COMPRIMIDO','No superar la dosis recomendada.',false,'RES000009-17#202'),
(203,'VITAMINA B12 + ACIDO FOLICO','250 mcg + 2.5 mg / 5 mL',null,null,false,'SOLUCION ORAL','No superar la dosis recomendada.',false,'RES000009-17#203'),
(204,'VITAMINA E (ALFATOCOFERIL ACETATO)','400 UI',400,'UI',false,'CAPSULA BLANDAS','No superar la dosis recomendada.',true,'RES000009-17#204'),
(205,'VITAMINA E + EXTRACTO DE ALOE','[ILEGIBLE - celda tachada en el origen]',null,null,true,'UNGUENTO / CREMA','No superar la dosis recomendada.',false,'RES000009-17#205'),
(206,'VITAMINAS, MINERALES Y AMINOACIDOS EN COMBINACION','NO DEBE EXCEDER EL 150 % DE LA DOSIS DIARIA RECOMENDADA',null,null,false,'TABLETAS / COMPRIMIDOS / JARABE / SOLUCION ORAL / POLVO','No superar la dosis recomendada.',false,'RES000009-17#206'),
(207,'XILOMETAZOLINA','1 mg / mL',null,null,false,'SOLUCION NASAL / SOLUCION NASALSPRAY DOSIFICADOR','No superar la dosis recomendada. Usar con precaucion en hipertensos.',false,'RES000009-17#207')
on conflict (clave_semilla) do update set
  orden               = excluded.orden,
  nombre_generico     = excluded.nombre_generico,
  concentracion_texto = excluded.concentracion_texto,
  tope_valor          = excluded.tope_valor,
  tope_unidad         = excluded.tope_unidad,
  tope_ilegible       = excluded.tope_ilegible,
  forma_farmaceutica  = excluded.forma_farmaceutica,
  observaciones       = excluded.observaciones,
  ambigua             = excluded.ambigua,
  updated_at          = now();
-- Nota: el DO UPDATE NO toca firma_composicion -> recargar el semilla no borra
-- los enlaces al catalogo que se hagan despues (Camino A).

-- ── 3) Funcion de estado con RASTRO del porque (punto 3 de Marien) ────
-- Devuelve el estado regulatorio de un producto frente al listado MVL y la
-- RAZON exacta, para no perder horas de diagnostico:
--   estado: 'venta_libre' | 'no_consta' | 'excede_tope'
--   razon : 'coincide' | 'excede_tope' | 'sin_coincidencia' | 'entrada_ambigua'
--         | 'catalogo_incompleto' | 'tope_no_consta' | 'producto_sin_principios'
-- Hoy (catalogo sin enlazar) devuelve 'no_consta / catalogo_incompleto' para todo.
create or replace function app.estado_venta_libre(p_producto uuid)
returns table(estado text, razon text, mvl_id uuid, fuente text, fecha_resolucion date)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_firma     text;
  v_nlinked   int;
  v_match     public.medicamento_venta_libre%rowtype;
  v_prod_conc numeric;
  v_tope_norm numeric;
begin
  -- firma de composicion del producto: IDs de sus principios, ordenados (sin forma/via)
  select string_agg(distinct ppa.principio_activo_id::text, '|' order by ppa.principio_activo_id::text)
    into v_firma
    from public.producto_principio_activo ppa
    where ppa.producto_id = p_producto;

  if v_firma is null or v_firma = '' then
    return query select 'no_consta'::text, 'producto_sin_principios'::text, null::uuid, null::text, null::date;
    return;
  end if;

  -- Camino A: si NADA esta enlazado aun, no se puede evaluar -> lado seguro.
  select count(*) into v_nlinked
    from public.medicamento_venta_libre
    where firma_composicion is not null and activo;
  if v_nlinked = 0 then
    return query select 'no_consta'::text, 'catalogo_incompleto'::text, null::uuid, null::text, null::date;
    return;
  end if;

  -- coincidencia EXACTA de composicion (prefiere la no ambigua)
  select * into v_match
    from public.medicamento_venta_libre
    where firma_composicion = v_firma and activo
    order by ambigua asc
    limit 1;

  if not found then
    return query select 'no_consta'::text, 'sin_coincidencia'::text, null::uuid, null::text, null::date;
    return;
  end if;

  if v_match.ambigua then
    return query select 'no_consta'::text, 'entrada_ambigua'::text, v_match.id, v_match.fuente, v_match.fecha_resolucion;
    return;
  end if;

  -- si el tope no consta (null / ilegible), no se asume nada -> exige receta
  if v_match.tope_valor is null then
    return query select 'no_consta'::text, 'tope_no_consta'::text, v_match.id, v_match.fuente, v_match.fecha_resolucion;
    return;
  end if;

  -- comparacion de tope SOLO hacia arriba (directa, no inferencia)
  select max(ppa.concentracion_normalizada) into v_prod_conc
    from public.producto_principio_activo ppa
    where ppa.producto_id = p_producto;
  v_tope_norm := app.conc_norm(v_match.tope_valor, v_match.tope_unidad, null, null);

  if v_prod_conc is not null and v_tope_norm is not null and v_prod_conc > v_tope_norm then
    return query select 'excede_tope'::text, 'excede_tope'::text, v_match.id, v_match.fuente, v_match.fecha_resolucion;
    return;
  end if;

  return query select 'venta_libre'::text, 'coincide'::text, v_match.id, v_match.fuente, v_match.fecha_resolucion;
  return;
end;
$fn$;

revoke execute on function app.estado_venta_libre(uuid) from public;
grant  execute on function app.estado_venta_libre(uuid) to authenticated, service_role;

-- ── 4) RLS + FORCE + politicas (referencia: lee todo autenticado; muta Dueno/Admin) ─
alter table public.medicamento_venta_libre enable  row level security;
alter table public.medicamento_venta_libre force   row level security;
revoke all on public.medicamento_venta_libre from anon;
grant select, insert, update, delete on public.medicamento_venta_libre to authenticated;

drop policy if exists mvl_select on public.medicamento_venta_libre;
create policy mvl_select on public.medicamento_venta_libre for select to authenticated
  using (true);
drop policy if exists mvl_admin_insert on public.medicamento_venta_libre;
create policy mvl_admin_insert on public.medicamento_venta_libre for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists mvl_admin_update on public.medicamento_venta_libre;
create policy mvl_admin_update on public.medicamento_venta_libre for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists mvl_admin_delete on public.medicamento_venta_libre;
create policy mvl_admin_delete on public.medicamento_venta_libre for delete to authenticated
  using ((select app.has_role('dueno','administrador')));
