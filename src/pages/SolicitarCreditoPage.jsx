import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, ArrowLeft, Clock, Car } from 'lucide-react'
import { useSolicitudCredito } from '../hooks/useOperaciones.js'
import { toNumber } from '../utils/format.js'
import PageLayout from '../components/layout/PageLayout.jsx'
import Card from '../components/ui/Card.jsx'
import Money from '../components/ui/Money.jsx'
import Badge from '../components/ui/Badge.jsx'
import Alert from '../components/ui/Alert.jsx'

const ACTIVIDADES = [
  { cod: '0111', label: '0111 — Cultivo de cereales (excepto arroz)' },
  { cod: '4711', label: '4711 — Comercio minorista (bodega/abarrotes)' },
  { cod: '4771', label: '4771 — Comercio minorista de prendas de vestir' },
  { cod: '4520', label: '4520 — Mantenimiento y reparación de vehículos' },
  { cod: '5610', label: '5610 — Restaurantes y servicio de comidas' },
  { cod: '4100', label: '4100 — Construcción de edificios' },
  { cod: '4923', label: '4923 — Transporte de carga por carretera' },
  { cod: '9601', label: '9601 — Lavado y limpieza de prendas' },
]

// Categorías de seguro vehicular (tasa anual referencial, promedio La Positiva)
const CATEGORIAS_VEHICULO = [
  { cod: 'BAJO', label: 'Auto / Camioneta SW / SUV — Riesgo bajo', tsv: 6.5 },
  { cod: 'MEDIO', label: 'Auto / Camioneta SW / SUV — Riesgo medio', tsv: 7.0 },
  { cod: 'ALTO', label: 'Auto / Camioneta SW / SUV — Riesgo alto', tsv: 7.5 },
  { cod: 'PICKUP', label: 'Pick Up — Uso particular', tsv: 8.0 },
]

const TEA_VEHICULAR = 21.0      // % anual referencial (entre 8.99% y 49.99% según tarifario)
const TSD_INDIVIDUAL = 0.127    // % mensual sobre saldo
const PORTES = 10               // S/ mensual

// Cálculo de cuota mensual de Crédito Vehicular (fórmulas TAR-VEHICULAR-001.01)
function calcularCuotaVehicular({ valorVehiculo, cuotaInicialPct, gastosFinanciados, plazo, tsvAnual }) {
  const vv = valorVehiculo
  const ci = vv * (cuotaInicialPct / 100)
  const gf = gastosFinanciados
  const F = vv - ci + gf
  if (F <= 0 || plazo <= 0) return null

  const tea = TEA_VEHICULAR / 100
  const tem = Math.pow(1 + tea, 1 / 12) - 1
  const tsd = TSD_INDIVIDUAL / 100
  const temSd = tem + tsd

  const sv = vv * (tsvAnual / 100 / 12)

  const n = plazo
  const cm = F * (temSd * Math.pow(1 + temSd, n)) / (Math.pow(1 + temSd, n) - 1)
  const cuotaTotal = cm + sv + PORTES

  return {
    montoFinanciar: F,
    cuotaInicial: ci,
    tea: TEA_VEHICULAR,
    cuotaCapitalInteres: cm,
    seguroVehicular: sv,
    portes: PORTES,
    cuotaMensual: cuotaTotal,
  }
}

export default function SolicitarCreditoPage() {
  const navigate = useNavigate()
  const { run, loading, error, result, reset } = useSolicitudCredito()
  const [validacion, setValidacion] = useState(null)

  const [form, setForm] = useState({
    montosolicitud: '',
    plazo: '',
    codtipocredito: 'CO',
    codactividadeconomica: '0111',
    montoingresoneto: '',
  })

  // Campos extra solo para Crédito Vehicular
  const [vehiculo, setVehiculo] = useState({
    valorVehiculo: '',
    cuotaInicialPct: 20,
    gastosFinanciados: 4000,
    categoria: 'BAJO',
  })

  const esVehicular = form.codtipocredito === 'VE'

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setV = (k) => (e) => setVehiculo((v) => ({ ...v, [k]: e.target.value }))

  // Simulación en vivo (solo si es vehicular y hay datos suficientes)
  const simulacion = useMemo(() => {
    if (!esVehicular) return null
    const valorVehiculo = toNumber(vehiculo.valorVehiculo)
    const plazo = parseInt(form.plazo, 10)
    if (valorVehiculo <= 0 || !plazo || plazo <= 0) return null

    const cat = CATEGORIAS_VEHICULO.find((c) => c.cod === vehiculo.categoria)
    return calcularCuotaVehicular({
      valorVehiculo,
      cuotaInicialPct: toNumber(vehiculo.cuotaInicialPct),
      gastosFinanciados: toNumber(vehiculo.gastosFinanciados),
      plazo,
      tsvAnual: cat?.tsv ?? 7,
    })
  }, [esVehicular, vehiculo, form.plazo])

  // Cuando es vehicular, el "monto solicitado" se sincroniza con el monto a financiar
  const montoEfectivo = esVehicular && simulacion ? simulacion.montoFinanciar : toNumber(form.montosolicitud)

  const onSubmit = async (e) => {
    e.preventDefault()
    setValidacion(null)

    const monto = montoEfectivo
    const plazo = parseInt(form.plazo, 10)
    const ingreso = toNumber(form.montoingresoneto)

    if (esVehicular) {
      if (toNumber(vehiculo.valorVehiculo) <= 0) { setValidacion('Ingrese el valor del vehículo.'); return }
      if (!simulacion) { setValidacion('Complete los datos del vehículo para simular la cuota.'); return }
    }

    if (monto <= 0) { setValidacion('Ingrese un monto de solicitud válido.'); return }
    if (!plazo || plazo <= 0) { setValidacion('Ingrese un plazo (número de cuotas) válido.'); return }
    if (ingreso <= 0) { setValidacion('Ingrese su ingreso neto mensual.'); return }
    if (!form.codactividadeconomica) { setValidacion('Seleccione una actividad económica.'); return }

    try {
      await run({
        montosolicitud: monto,
        plazo,
        codtipocredito: form.codtipocredito,
        codactividadeconomica: form.codactividadeconomica,
        montoingresoneto: ingreso,
      })
    } catch {
      /* mensaje de elegibilidad se muestra vía `error` */
    }
  }

  const nuevaSolicitud = () => {
    reset()
    setForm({ montosolicitud: '', plazo: '', codtipocredito: 'CO', codactividadeconomica: '0111', montoingresoneto: '' })
    setVehiculo({ valorVehiculo: '', cuotaInicialPct: 20, gastosFinanciados: 4000, categoria: 'BAJO' })
  }

  return (
    <PageLayout>
      <button className="hb-back" onClick={() => navigate('/operaciones')}>
        <ArrowLeft size={16} /> Volver a Operaciones
      </button>
      <h1 className="bbva-page-title">Solicitud de Crédito — Producto Digital</h1>
      <p className="bbva-page-sub">Operaciones › Solicitar préstamo</p>

      {result ? (
        <Card>
          <div className="hb-comprobante">
            <h3>Solicitud registrada</h3>
            <p style={{ marginTop: 0 }}>{result.mensaje}</p>
            <dl className="hb-dl">
              <div><dt>Código de solicitud</dt><dd>{result.codsolicitud}</dd></div>
              <div><dt>Estado</dt><dd><Badge estado={result.estado} /></dd></div>
              <div><dt>Monto solicitado</dt><dd><Money value={result.montosolicitud} /></dd></div>
              <div><dt>Plazo</dt><dd>{result.plazo} cuotas</dd></div>
            </dl>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--hb-amber)', fontSize: 13, marginBottom: 0 }}>
              <Clock size={15} /> Su solicitud pasará por evaluación del banco (core financiero). Le notificaremos el resultado.
            </p>
          </div>
          <div className="bbva-form-actions">
            <button className="bbva-btn-gray" onClick={nuevaSolicitud}>Nueva solicitud</button>
            <button className="bbva-btn" onClick={() => navigate('/inicio')}>Ir al inicio</button>
          </div>
        </Card>
      ) : (
        <Card title="Datos de la solicitud" icon={<FilePlus2 size={18} />}>
          {error && <Alert tipo="error">{error}</Alert>}
          {validacion && <Alert tipo="warn">{validacion}</Alert>}

          <form onSubmit={onSubmit}>
            <div className="hb-grid-2">
              {!esVehicular && (
                <div className="hb-field">
                  <label htmlFor="monto">Monto solicitado (S/)</label>
                  <input id="monto" className="hb-input" type="number" min="1" step="0.01"
                    placeholder="0.00" value={form.montosolicitud} onChange={setF('montosolicitud')} />
                </div>
              )}
              <div className="hb-field">
                <label htmlFor="plazo">Plazo (n° de cuotas / meses)</label>
                <input id="plazo" className="hb-input" type="number" min="1" step="1"
                  placeholder="12" value={form.plazo} onChange={setF('plazo')} />
              </div>
            </div>

            <div className="hb-grid-2">
              <div className="hb-field">
                <label htmlFor="tipo">Tipo de crédito</label>
                <select id="tipo" className="hb-select" value={form.codtipocredito} onChange={setF('codtipocredito')}>
                  <option value="CO">CO — Consumo</option>
                  <option value="ME">ME — Microempresa</option>
                  <option value="VE">VE — Crédito Vehicular</option>
                </select>
              </div>
              <div className="hb-field">
                <label htmlFor="ingreso">Ingreso neto mensual (S/)</label>
                <input id="ingreso" className="hb-input" type="number" min="0" step="0.01"
                  placeholder="0.00" value={form.montoingresoneto} onChange={setF('montoingresoneto')} />
              </div>
            </div>

            <div className="hb-field">
              <label htmlFor="actividad">Actividad económica (CIIU)</label>
              <select id="actividad" className="hb-select" value={form.codactividadeconomica} onChange={setF('codactividadeconomica')}>
                {ACTIVIDADES.map((a) => (
                  <option key={a.cod} value={a.cod}>{a.label}</option>
                ))}
              </select>
            </div>

            {esVehicular && (
              <>
                <h3 className="hb-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Car size={17} /> Datos del vehículo
                </h3>
                <div className="hb-grid-2">
                  <div className="hb-field">
                    <label htmlFor="valorVehiculo">Valor del vehículo (S/)</label>
                    <input id="valorVehiculo" className="hb-input" type="number" min="1" step="0.01"
                      placeholder="60000" value={vehiculo.valorVehiculo} onChange={setV('valorVehiculo')} />
                  </div>
                  <div className="hb-field">
                    <label htmlFor="cuotaInicialPct">Cuota inicial (%)</label>
                    <input id="cuotaInicialPct" className="hb-input" type="number" min="10" max="80" step="1"
                      value={vehiculo.cuotaInicialPct} onChange={setV('cuotaInicialPct')} />
                  </div>
                </div>
                <div className="hb-grid-2">
                  <div className="hb-field">
                    <label htmlFor="categoria">Categoría del vehículo</label>
                    <select id="categoria" className="hb-select" value={vehiculo.categoria} onChange={setV('categoria')}>
                      {CATEGORIAS_VEHICULO.map((c) => (
                        <option key={c.cod} value={c.cod}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hb-field">
                    <label htmlFor="gastosFinanciados">Gastos financiados (S/)</label>
                    <input id="gastosFinanciados" className="hb-input" type="number" min="0" step="0.01"
                      value={vehiculo.gastosFinanciados} onChange={setV('gastosFinanciados')} />
                  </div>
                </div>

                {simulacion && (
                  <div className="hb-alert hb-alert-info" style={{ flexDirection: 'column', gap: 8 }}>
                    <strong>Simulación de cuota mensual</strong>
                    <dl className="hb-dl">
                      <div><dt>Monto a financiar</dt><dd><Money value={simulacion.montoFinanciar} /></dd></div>
                      <div><dt>Cuota inicial</dt><dd><Money value={simulacion.cuotaInicial} /></dd></div>
                      <div><dt>TEA referencial</dt><dd>{simulacion.tea.toFixed(2)}%</dd></div>
                      <div><dt>Seguro vehicular (mensual)</dt><dd><Money value={simulacion.seguroVehicular} /></dd></div>
                    </dl>
                    <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700 }}>
                      Cuota mensual estimada: <Money value={simulacion.cuotaMensual} />
                    </p>
                    <small style={{ opacity: 0.8 }}>
                      Incluye amortización, interés, seguro de desgravamen, seguro vehicular y portes. Tasa final sujeta a evaluación crediticia.
                    </small>
                  </div>
                )}
              </>
            )}

            <button type="submit" className="bbva-btn" disabled={loading}>
              <FilePlus2 size={18} />
              {loading ? 'Enviando solicitud…' : 'Enviar solicitud'}
            </button>
          </form>
        </Card>
      )}
    </PageLayout>
  )
}