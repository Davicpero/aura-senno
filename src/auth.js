import jwt from 'jsonwebtoken'

export function autenticar(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({
            mensagem: 'Token não informado'
        })
    }

    try {
        const usuario = jwt.verify(token, process.env.JWT_SECRET)

        req.usuario = usuario

        next()
    } catch {
        return res.status(401).json({
            mensagem: 'Token inválido ou expirado'
        })
    }
}

export function autorizar(perfisPermitidos = ['admin']) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensagem: 'Usuário não autenticado'
            })
        }

        if (!perfisPermitidos.includes(req.usuario.perfil)) {
            return res.status(403).json({
                mensagem: 'Acesso negado: operação não permitida para o seu perfil'
            })
        }

        next()
    }
}

export default autenticar
