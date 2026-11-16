import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from './database.js'
import { autenticar, autorizar } from './auth.js'

const router = express.Router()

// Função auxiliar para gravação de auditoria (RNF06)
async function registrarAuditoria(id_usuario, acao, detalhe, conexao = null) {
    try {
        const executor = conexao || pool
        await executor.query(
            'INSERT INTO auditoria (id_usuario, acao, detalhe) VALUES ($1, $2, $3)',
            [id_usuario || null, acao, detalhe]
        )
    } catch (erro) {
        console.error('Erro ao gravar auditoria:', erro.message)
    }
}

// ==========================================
// AUTENTICAÇÃO E LOGIN
// ==========================================

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body

        if (!email || !senha) {
            return res.status(401).json({
                mensagem: 'Usuário ou senha inválidos'
            })
        }

        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                mensagem: 'Usuário ou senha inválidos'
            })
        }

        const usuario = resultado.rows[0]

        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        )

        if (!senhaCorreta) {
            return res.status(401).json({
                mensagem: 'Usuário ou senha inválidos'
            })
        }

        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                perfil: usuario.perfil
            },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        )

        await registrarAuditoria(usuario.id_usuario, 'LOGIN', `Login realizado por ${usuario.email}`)

        res.json({
            mensagem: 'Login realizado',
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.perfil
            }
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao realizar login'
        })
    }
})

// ==========================================
// PAINEL / DASHBOARD DE INDICADORES (README)
// ==========================================

router.get('/dashboard/indicadores', autenticar, async (req, res) => {
    try {
        const clientesRes = await pool.query('SELECT COUNT(*)::int AS total FROM clientes')
        const produtosRes = await pool.query('SELECT COUNT(*)::int AS total FROM produtos WHERE ativo = TRUE')
        const faturamentoRes = await pool.query(
            `SELECT COALESCE(SUM(valor_total), 0)::numeric(10,2) AS total
             FROM pedidos
             WHERE status IN ('pago', 'entregue')
               AND DATE_TRUNC('month', data_pedido) = DATE_TRUNC('month', CURRENT_DATE)`
        )

        res.json({
            totalClientes: clientesRes.rows[0].total,
            produtosAtivos: produtosRes.rows[0].total,
            faturamentoMes: parseFloat(faturamentoRes.rows[0].total)
        })
    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao carregar indicadores do painel'
        })
    }
})

// ==========================================
// AUDITORIA (RNF06) - Apenas Admin
// ==========================================

router.get('/auditoria', autenticar, autorizar(['admin']), async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT a.id_auditoria, a.acao, a.data_hora, a.detalhe, u.nome AS usuario
             FROM auditoria a
             LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
             ORDER BY a.id_auditoria DESC
             LIMIT 100`
        )
        res.json(resultado.rows)
    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar auditoria'
        })
    }
})

// ==========================================
// CLIENTES (RF02, RF03, RF04, RF05, RN01, RN02)
// ==========================================

router.get('/clientes', autenticar, async (req, res) => {
    try {
        const page = parseInt(req.query.page)
        const limit = parseInt(req.query.limit)

        if (Number.isInteger(page) && Number.isInteger(limit) && page > 0 && limit > 0) {
            const offset = (page - 1) * limit
            const totalRes = await pool.query('SELECT COUNT(*)::int AS total FROM clientes')
            const total = totalRes.rows[0].total

            const resultado = await pool.query(
                'SELECT * FROM clientes ORDER BY id_cliente LIMIT $1 OFFSET $2',
                [limit, offset]
            )

            return res.json({
                dados: resultado.rows,
                total,
                page,
                totalPages: Math.ceil(total / limit)
            })
        }

        const resultado = await pool.query(
            'SELECT * FROM clientes ORDER BY id_cliente'
        )
        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar clientes'
        })
    }
})

router.post('/clientes', autenticar, async (req, res) => {
    try {
        const { nome, email, telefone, cpf_cnpj } = req.body

        if (!nome || !email || !cpf_cnpj) {
            return res.status(400).json({
                mensagem: 'Nome, e-mail e CPF/CNPJ são campos obrigatórios'
            })
        }

        const documentoLimpo = String(cpf_cnpj).replace(/\D/g, '')
        if (documentoLimpo.length !== 11 && documentoLimpo.length !== 14) {
            return res.status(400).json({
                mensagem: 'O documento deve possuir 11 dígitos (CPF) ou 14 dígitos (CNPJ)'
            })
        }

        const resultado = await pool.query(
            `INSERT INTO clientes (nome, email, telefone, cpf_cnpj)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nome.trim(), email.trim(), telefone ? telefone.trim() : null, documentoLimpo]
        )

        const novoCliente = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'CADASTRO_CLIENTE',
            `Cliente ${novoCliente.id_cliente} (${novoCliente.nome}) cadastrado`
        )

        res.status(201).json(novoCliente)

    } catch (erro) {
        if (erro.code === '23505') {
            return res.status(409).json({
                mensagem: 'E-mail ou CPF/CNPJ já cadastrado no sistema'
            })
        }

        res.status(500).json({
            mensagem: 'Erro ao cadastrar cliente'
        })
    }
})

router.put('/clientes/:id', autenticar, async (req, res) => {
    try {
        const { nome, email, telefone, cpf_cnpj } = req.body

        if (!nome || !email || !cpf_cnpj) {
            return res.status(400).json({
                mensagem: 'Nome, e-mail e CPF/CNPJ são campos obrigatórios'
            })
        }

        const documentoLimpo = String(cpf_cnpj).replace(/\D/g, '')
        if (documentoLimpo.length !== 11 && documentoLimpo.length !== 14) {
            return res.status(400).json({
                mensagem: 'O documento deve possuir 11 dígitos (CPF) ou 14 dígitos (CNPJ)'
            })
        }

        const resultado = await pool.query(
            `UPDATE clientes
             SET nome = $1, email = $2, telefone = $3, cpf_cnpj = $4
             WHERE id_cliente = $5
             RETURNING *`,
            [nome.trim(), email.trim(), telefone ? telefone.trim() : null, documentoLimpo, req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        const clienteAtualizado = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'EDICAO_CLIENTE',
            `Cliente ${clienteAtualizado.id_cliente} (${clienteAtualizado.nome}) atualizado`
        )

        res.json(clienteAtualizado)

    } catch (erro) {
        if (erro.code === '23505') {
            return res.status(409).json({
                mensagem: 'E-mail ou CPF/CNPJ já cadastrado para outro cliente'
            })
        }

        res.status(500).json({
            mensagem: 'Erro ao atualizar cliente'
        })
    }
})

// Exclusão de cliente restrita ao ADMIN com cascade em pedidos e itens (RF02, RF05, RN01)
router.delete('/clientes/:id', autenticar, autorizar(['admin']), async (req, res) => {
    try {
        const resultado = await pool.query(
            'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
            [req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        const clienteExcluido = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'EXCLUSAO_CLIENTE',
            `Cliente ${clienteExcluido.id_cliente} (${clienteExcluido.nome}) excluído com dependências`
        )

        res.json({
            mensagem: 'Cliente excluído com sucesso'
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao excluir cliente'
        })
    }
})

// ==========================================
// PRODUTOS (RF02, RF06, RF07, RN01, RN03)
// ==========================================

router.get('/produtos', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM produtos WHERE ativo = TRUE ORDER BY id_produto'
        )

        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar produtos'
        })
    }
})

router.post('/produtos', autenticar, async (req, res) => {
    try {
        const { nome, descricao, preco, estoque } = req.body

        const precoNum = Number(preco)
        const estoqueNum = Number(estoque)

        if (!nome || isNaN(precoNum) || precoNum <= 0 || isNaN(estoqueNum)) {
            return res.status(400).json({
                mensagem: 'Nome obrigatório, preço deve ser maior que zero e estoque numérico'
            })
        }

        const resultado = await pool.query(
            `INSERT INTO produtos (nome, descricao, preco, estoque)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nome.trim(), descricao ? descricao.trim() : null, precoNum, estoqueNum]
        )

        const novoProduto = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'CADASTRO_PRODUTO',
            `Produto ${novoProduto.id_produto} (${novoProduto.nome}) cadastrado`
        )

        res.status(201).json(novoProduto)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao cadastrar produto'
        })
    }
})

router.put('/produtos/:id', autenticar, async (req, res) => {
    try {
        const { nome, descricao, preco, estoque } = req.body

        const precoNum = Number(preco)
        const estoqueNum = Number(estoque)

        if (!nome || isNaN(precoNum) || precoNum <= 0 || isNaN(estoqueNum)) {
            return res.status(400).json({
                mensagem: 'Nome obrigatório, preço deve ser maior que zero e estoque numérico'
            })
        }

        const resultado = await pool.query(
            `UPDATE produtos
             SET nome = $1, descricao = $2, preco = $3, estoque = $4
             WHERE id_produto = $5 AND ativo = TRUE
             RETURNING *`,
            [nome.trim(), descricao ? descricao.trim() : null, precoNum, estoqueNum, req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Produto não encontrado ou inativo'
            })
        }

        const produtoAtualizado = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'EDICAO_PRODUTO',
            `Produto ${produtoAtualizado.id_produto} (${produtoAtualizado.nome}) atualizado`
        )

        res.json(produtoAtualizado)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao atualizar produto'
        })
    }
})

// Desativação de produto restrita ao ADMIN (RF02, RN01)
router.delete('/produtos/:id', autenticar, autorizar(['admin']), async (req, res) => {
    try {
        const resultado = await pool.query(
            `UPDATE produtos
             SET ativo = FALSE
             WHERE id_produto = $1 AND ativo = TRUE
             RETURNING *`,
            [req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Produto não encontrado ou já desativado'
            })
        }

        const produtoDesativado = resultado.rows[0]
        await registrarAuditoria(
            req.usuario.id_usuario,
            'DESATIVACAO_PRODUTO',
            `Produto ${produtoDesativado.id_produto} (${produtoDesativado.nome}) desativado`
        )

        res.json({
            mensagem: 'Produto desativado com sucesso'
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao desativar produto'
        })
    }
})

// ==========================================
// PEDIDOS (RF02, RF08, RF09, RF10, RN01, RN04, RN05, RN06)
// ==========================================

router.get('/pedidos', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                p.id_pedido,
                p.data_pedido,
                p.status,
                p.valor_total,
                c.nome AS cliente,
                u.nome AS usuario
             FROM pedidos p
             INNER JOIN clientes c ON p.id_cliente = c.id_cliente
             INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
             ORDER BY p.id_pedido DESC`
        )

        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar pedidos'
        })
    }
})

router.get('/pedidos/:id', autenticar, async (req, res) => {
    try {
        const pedido = await pool.query(
            `SELECT
                p.*,
                c.nome AS cliente,
                u.nome AS usuario
             FROM pedidos p
             INNER JOIN clientes c ON p.id_cliente = c.id_cliente
             INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
             WHERE p.id_pedido = $1`,
            [req.params.id]
        )

        if (pedido.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            })
        }

        const itens = await pool.query(
            `SELECT
                i.id_item,
                i.id_produto,
                pr.nome AS produto,
                i.quantidade,
                i.preco_unitario,
                i.subtotal
             FROM itens_pedido i
             INNER JOIN produtos pr ON i.id_produto = pr.id_produto
             WHERE i.id_pedido = $1`,
            [req.params.id]
        )

        res.json({
            pedido: pedido.rows[0],
            itens: itens.rows
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar pedido'
        })
    }
})

// Cadastro de pedido: status inicial 'rascunho', validação de R$ 50,00 e suporte a estoque negativo (RN04, RN05, RF08)
router.post('/pedidos', autenticar, async (req, res) => {
    const conexao = await pool.connect()

    try {
        const { id_cliente, itens } = req.body

        if (!id_cliente || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({
                mensagem: 'Informe o cliente e pelo menos um produto'
            })
        }

        const quantidades = new Map()

        for (const item of itens) {
            const idProduto = Number(item.id_produto)
            const quantidade = Number(item.quantidade)

            if (
                !Number.isInteger(idProduto) ||
                !Number.isInteger(quantidade) ||
                idProduto <= 0 ||
                quantidade <= 0
            ) {
                return res.status(400).json({
                    mensagem: 'Produto ou quantidade inválidos'
                })
            }

            quantidades.set(
                idProduto,
                (quantidades.get(idProduto) || 0) + quantidade
            )
        }

        await conexao.query('BEGIN')

        const cliente = await conexao.query(
            'SELECT id_cliente FROM clientes WHERE id_cliente = $1',
            [id_cliente]
        )

        if (cliente.rows.length === 0) {
            await conexao.query('ROLLBACK')
            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        // Criar pedido em status 'rascunho'
        const pedido = await conexao.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, status, valor_total)
             VALUES ($1, $2, 'rascunho', 0)
             RETURNING *`,
            [id_cliente, req.usuario.id_usuario]
        )

        const idPedido = pedido.rows[0].id_pedido
        let valorTotalCentavos = 0
        const itensGravados = []

        for (const [idProduto, quantidade] of [...quantidades.entries()].sort((a, b) => a[0] - b[0])) {
            const produto = await conexao.query(
                `SELECT id_produto, nome, preco, estoque
                 FROM produtos
                 WHERE id_produto = $1 AND ativo = TRUE
                 FOR UPDATE`,
                [idProduto]
            )

            if (produto.rows.length === 0) {
                throw new Error(`Produto ${idProduto} não encontrado ou inativo`)
            }

            const dadosProduto = produto.rows[0]

            // Conforme RN05 e RF08: Venda a descoberto permitida, estoque pode ficar negativo
            const precoCentavos = Math.round(Number(dadosProduto.preco) * 100)
            const subtotalCentavos = precoCentavos * quantidade

            valorTotalCentavos += subtotalCentavos

            itensGravados.push({
                idProduto,
                quantidade,
                precoUnitario: (precoCentavos / 100).toFixed(2),
                subtotal: (subtotalCentavos / 100).toFixed(2)
            })

            await conexao.query(
                `INSERT INTO itens_pedido
                 (id_pedido, id_produto, quantidade, preco_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    idPedido,
                    idProduto,
                    quantidade,
                    (precoCentavos / 100).toFixed(2),
                    (subtotalCentavos / 100).toFixed(2)
                ]
            )

            // Baixa de estoque (pode ficar negativo conforme RN05)
            await conexao.query(
                `UPDATE produtos
                 SET estoque = estoque - $1
                 WHERE id_produto = $2`,
                [quantidade, idProduto]
            )
        }

        // Validação da Regra de Pedido Mínimo: R$ 50,00 (RN04 / RF08)
        if (valorTotalCentavos < 5000) {
            throw new Error('O valor total do pedido não pode ser inferior a R$ 50,00')
        }

        await conexao.query(
            `UPDATE pedidos
             SET valor_total = $1
             WHERE id_pedido = $2`,
            [(valorTotalCentavos / 100).toFixed(2), idPedido]
        )

        await registrarAuditoria(
            req.usuario.id_usuario,
            'REGISTRO_PEDIDO',
            `Pedido ${idPedido} registrado em rascunho com total de R$ ${(valorTotalCentavos / 100).toFixed(2)}`,
            conexao
        )

        await conexao.query('COMMIT')

        res.status(201).json({
            mensagem: 'Pedido cadastrado com sucesso',
            id_pedido: idPedido,
            status: 'rascunho',
            valor_total: (valorTotalCentavos / 100).toFixed(2)
        })

    } catch (erro) {
        await conexao.query('ROLLBACK')

        res.status(400).json({
            mensagem: erro.message || 'Erro ao cadastrar pedido'
        })

    } finally {
        conexao.release()
    }
})

// Transição de status do pedido conforme máquina de estados (RF09, RN07)
router.put('/pedidos/:id/status', autenticar, async (req, res) => {
    try {
        const { status: novoStatus } = req.body

        const resultado = await pool.query(
            'SELECT id_pedido, status FROM pedidos WHERE id_pedido = $1',
            [req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            })
        }

        const statusAtual = resultado.rows[0].status

        // Validação de transições permitidas
        const transicoesValidas = {
            'rascunho': ['confirmado'],
            'confirmado': ['pago'],
            'pago': ['entregue'],
            'entregue': [],
            'cancelado': []
        }

        const permitidas = transicoesValidas[statusAtual] || []

        if (!permitidas.includes(novoStatus)) {
            return res.status(422).json({
                mensagem: `Transição inválida de '${statusAtual}' para '${novoStatus}'. Transições permitidas: ${permitidas.join(', ') || 'nenhuma'}`
            })
        }

        const atualizado = await pool.query(
            'UPDATE pedidos SET status = $1 WHERE id_pedido = $2 RETURNING *',
            [novoStatus, req.params.id]
        )

        await registrarAuditoria(
            req.usuario.id_usuario,
            'TRANSICAO_STATUS_PEDIDO',
            `Pedido ${req.params.id} alterado de '${statusAtual}' para '${novoStatus}'`
        )

        res.json({
            mensagem: 'Status atualizado com sucesso',
            pedido: atualizado.rows[0]
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao atualizar status do pedido'
        })
    }
})

// Cancelamento de pedido: restrito ao ADMIN, permitido apenas para 'rascunho' e 'confirmado' com estorno de estoque (RF02, RF10, RN01, RN06)
async function cancelarPedidoHandler(req, res) {
    const conexao = await pool.connect()

    try {
        await conexao.query('BEGIN')

        const pedido = await conexao.query(
            `SELECT * FROM pedidos
             WHERE id_pedido = $1
             FOR UPDATE`,
            [req.params.id]
        )

        if (pedido.rows.length === 0) {
            await conexao.query('ROLLBACK')
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            })
        }

        const dadosPedido = pedido.rows[0]

        if (dadosPedido.status === 'cancelado') {
            await conexao.query('ROLLBACK')
            return res.status(400).json({
                mensagem: 'Este pedido já está cancelado'
            })
        }

        // RN06: Pedido pago ou entregue não pode ser cancelado
        if (dadosPedido.status === 'pago' || dadosPedido.status === 'entregue') {
            await conexao.query('ROLLBACK')
            return res.status(400).json({
                mensagem: `Não é permitido cancelar pedidos com status '${dadosPedido.status}'. Operação permitida apenas para 'rascunho' e 'confirmado'`
            })
        }

        // Estorno de estoque das quantidades
        const itens = await conexao.query(
            `SELECT id_produto, quantidade
             FROM itens_pedido
             WHERE id_pedido = $1`,
            [req.params.id]
        )

        for (const item of itens.rows) {
            await conexao.query(
                `UPDATE produtos
                 SET estoque = estoque + $1
                 WHERE id_produto = $2`,
                [item.quantidade, item.id_produto]
            )
        }

        await conexao.query(
            `UPDATE pedidos
             SET status = 'cancelado'
             WHERE id_pedido = $1`,
            [req.params.id]
        )

        await registrarAuditoria(
            req.usuario.id_usuario,
            'CANCELAMENTO_PEDIDO',
            `Pedido ${req.params.id} cancelado pelo administrador com estorno de itens para o estoque`,
            conexao
        )

        await conexao.query('COMMIT')

        res.json({
            mensagem: 'Pedido cancelado e estoque estornado com sucesso'
        })

    } catch (erro) {
        await conexao.query('ROLLBACK')
        res.status(500).json({
            mensagem: 'Erro ao cancelar pedido'
        })

    } finally {
        conexao.release()
    }
}

// Suporte tanto ao método DELETE (especificado em RF08/RF10) quanto ao PATCH (legado)
router.delete('/pedidos/:id', autenticar, autorizar(['admin']), cancelarPedidoHandler)
router.patch('/pedidos/:id/cancelar', autenticar, autorizar(['admin']), cancelarPedidoHandler)

export default router
