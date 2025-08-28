export default async function handler(req, res) {
  res.status(200).json({
    cidade: "São Paulo",
    temperatura: (18 + Math.random() * 10).toFixed(1),
    descricao: "Parcialmente nublado",
    umidade: 70,
    vento: 10,
    atualizadoEm: new Date()
  });
}
