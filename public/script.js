const token = localStorage.getItem('token')
const usuario = JSON.parse(localStorage.getItem('usuario') || 'null')

if (!token || !usuario) {
    window.location.href = 'login.html'
}

const mensagem = document.getElementById('mensagem')
const itensPedido = []
const ehAdmin = usuario && usuario.perfil === 'admin'

// Exibição do usuário e perfil no topo
const nomeElem = document.getElementById('nomeUsuario')
const badgeElem = document.getElementById('badgePerfil')

if (nomeElem && usuario) {
    nomeElem.textContent = usuario.nome
}

if (badgeElem && usuario) {
    badgeElem.textContent = usuario.perfil
    badgeElem.className = `badge badge-${usuario.perfil}`
}

function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, function (caractere) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[caractere]
    })
}

function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto
    mensagem.style.color = erro ? '#dc2626' : '#1e3a8a'
}

async function requisicao(url, metodo = 'GET', dados = null) {
    const opcoes = {
        method: metodo,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }

    if (dados !== null) {
        opcoes.headers['Content-Type'] = 'application/json'
        opcoes.body = JSON.stringify(dados)
    }

    const resposta = await fetch(url, opcoes)
    const resultado = await resposta.json().catch(() => ({}))

    if (resposta.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('usuario')
        window.location.href = 'login.html'
        throw new Error('Sessão expirada. Faça login novamente.')
    }

    if (!resposta.ok) {
        throw new Error(resultado.mensagem || 'Erro ao processar requisição')
    }

    return resultado
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    })
}

function formatarData(data) {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })
}

function abrirTela(nome) {
    document.querySelectorAll('.tela').forEach(function (tela) {
        tela.classList.add('escondido')
    })

    const telaAlvo = document.getElementById(nome)
    if (telaAlvo) {
        telaAlvo.classList.remove('escondido')
    }

    document.querySelectorAll('.menu-btn').forEach(function (botao) {
        botao.classList.remove('ativo')
    })

    const botaoAtivo = document.querySelector(`[data-tela="${nome}"]`)
    if (botaoAtivo) {
        botaoAtivo.classList.add('ativo')
    }

    mostrarMensagem('')

    if (nome === 'inicio') carregarDashboard()
    if (nome === 'clientes') carregarClientes()
    if (nome === 'produtos') carregarProdutos()
    if (nome === 'pedidos') carregarPedidos()
}

document.querySelectorAll('.menu-btn').forEach(function (botao) {
    botao.addEventListener('click', function () {
        abrirTela(botao.dataset.tela)
    })
})

document.querySelectorAll('[data-ir]').forEach(function (botao) {
    botao.addEventListener('click', function () {
        abrirTela(botao.dataset.ir)
    })
})

document.getElementById('btnSair').addEventListener('click', function () {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = 'login.html'
})

// ==========================================
// PAINEL DE INDICADORES (DASHBOARD)
// ==========================================
async function carregarDashboard() {
    try {
        const dados = await requisicao('/api/dashboard/indicadores')
        document.getElementById('indClientes').textContent = dados.totalClientes ?? 0
        document.getElementById('indProdutos').textContent = dados.produtosAtivos ?? 0
        document.getElementById('indFaturamento').textContent = formatarMoeda(dados.faturamentoMes)
    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

// ==========================================
// CLIENTES (RF02, RF03, RF04, RF05, RN01, RN02)
// ==========================================
async function carregarClientes() {
    try {
        const clientes = await requisicao('/api/clientes')
        const lista = document.getElementById('listaClientes')
        lista.innerHTML = ''

        const listaDados = Array.isArray(clientes) ? clientes : (clientes.dados || [])

        listaDados.forEach(function (cliente) {
            const botaoExcluir = ehAdmin ? `
                <button class="btn-excluir" data-excluir-cliente="${cliente.id_cliente}">
                    Excluir
                </button>
            ` : ''

            lista.innerHTML += `
                <tr>
                    <td>${escapar(cliente.nome)}</td>
                    <td>${escapar(cliente.email)}</td>
                    <td>${escapar(cliente.telefone || '-')}</td>
                    <td>${escapar(cliente.cpf_cnpj)}</td>
                    <td>
                        <button class="btn-editar" data-editar-cliente="${cliente.id_cliente}">
                            Editar
                        </button>
                        ${botaoExcluir}
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

document.getElementById('formCliente').addEventListener('submit', async function (event) {
    event.preventDefault()

    const id = document.getElementById('idCliente').value

    const dados = {
        nome: document.getElementById('clienteNome').value.trim(),
        email: document.getElementById('clienteEmail').value.trim(),
        telefone: document.getElementById('clienteTelefone').value.trim(),
        cpf_cnpj: document.getElementById('clienteDocumento').value.trim()
    }

    try {
        if (id) {
            await requisicao(`/api/clientes/${id}`, 'PUT', dados)
            mostrarMensagem('Cliente atualizado com sucesso!')
        } else {
            await requisicao('/api/clientes', 'POST', dados)
            mostrarMensagem('Cliente cadastrado com sucesso!')
        }

        this.reset()
        document.getElementById('idCliente').value = ''
        carregarClientes()

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

document.getElementById('listaClientes').addEventListener('click', async function (event) {
    const idEditar = event.target.dataset.editarCliente
    const idExcluir = event.target.dataset.excluirCliente

    try {
        if (idEditar) {
            const clientes = await requisicao('/api/clientes')
            const listaDados = Array.isArray(clientes) ? clientes : (clientes.dados || [])
            const cliente = listaDados.find(function (item) {
                return item.id_cliente == idEditar
            })

            if (cliente) {
                document.getElementById('idCliente').value = cliente.id_cliente
                document.getElementById('clienteNome').value = cliente.nome
                document.getElementById('clienteEmail').value = cliente.email || ''
                document.getElementById('clienteTelefone').value = cliente.telefone || ''
                document.getElementById('clienteDocumento').value = cliente.cpf_cnpj || ''
                mostrarMensagem(`Editando cliente: ${cliente.nome}`)
            }
        }

        if (idExcluir) {
            if (!ehAdmin) {
                mostrarMensagem('Operação restrita para administradores', true)
                return
            }

            if (!confirm('Deseja realmente excluir este cliente? Seus pedidos vinculados também serão excluídos.')) {
                return
            }

            await requisicao(`/api/clientes/${idExcluir}`, 'DELETE')
            mostrarMensagem('Cliente excluído com sucesso!')
            carregarClientes()
        }

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

document.getElementById('limparCliente').addEventListener('click', function () {
    document.getElementById('formCliente').reset()
    document.getElementById('idCliente').value = ''
    mostrarMensagem('')
})

// ==========================================
// PRODUTOS (RF02, RF06, RF07, RN01, RN03)
// ==========================================
async function carregarProdutos() {
    try {
        const produtos = await requisicao('/api/produtos')
        const lista = document.getElementById('listaProdutos')
        lista.innerHTML = ''

        produtos.forEach(function (produto) {
            const botaoDesativar = ehAdmin ? `
                <button class="btn-excluir" data-excluir-produto="${produto.id_produto}">
                    Desativar
                </button>
            ` : ''

            lista.innerHTML += `
                <tr>
                    <td>${escapar(produto.nome)}</td>
                    <td>${formatarMoeda(produto.preco)}</td>
                    <td>${escapar(produto.estoque)}</td>
                    <td>
                        <button class="btn-editar" data-editar-produto="${produto.id_produto}">
                            Editar
                        </button>
                        ${botaoDesativar}
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

document.getElementById('formProduto').addEventListener('submit', async function (event) {
    event.preventDefault()

    const id = document.getElementById('idProduto').value
    const preco = Number(document.getElementById('produtoPreco').value)

    if (preco <= 0) {
        mostrarMensagem('O preço do produto deve ser maior que zero (R$ 0,00)', true)
        return
    }

    const dados = {
        nome: document.getElementById('produtoNome').value.trim(),
        descricao: document.getElementById('produtoDescricao').value.trim(),
        preco: preco,
        estoque: Number(document.getElementById('produtoEstoque').value)
    }

    try {
        if (id) {
            await requisicao(`/api/produtos/${id}`, 'PUT', dados)
            mostrarMensagem('Produto atualizado com sucesso!')
        } else {
            await requisicao('/api/produtos', 'POST', dados)
            mostrarMensagem('Produto cadastrado com sucesso!')
        }

        this.reset()
        document.getElementById('idProduto').value = ''
        carregarProdutos()

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

document.getElementById('listaProdutos').addEventListener('click', async function (event) {
    const idEditar = event.target.dataset.editarProduto
    const idExcluir = event.target.dataset.excluirProduto

    try {
        if (idEditar) {
            const produtos = await requisicao('/api/produtos')
            const produto = produtos.find(function (item) {
                return item.id_produto == idEditar
            })

            if (produto) {
                document.getElementById('idProduto').value = produto.id_produto
                document.getElementById('produtoNome').value = produto.nome
                document.getElementById('produtoDescricao').value = produto.descricao || ''
                document.getElementById('produtoPreco').value = produto.preco
                document.getElementById('produtoEstoque').value = produto.estoque
                mostrarMensagem(`Editando produto: ${produto.nome}`)
            }
        }

        if (idExcluir) {
            if (!ehAdmin) {
                mostrarMensagem('Operação restrita para administradores', true)
                return
            }

            if (!confirm('Deseja realmente desativar este produto?')) return

            await requisicao(`/api/produtos/${idExcluir}`, 'DELETE')
            mostrarMensagem('Produto desativado com sucesso!')
            carregarProdutos()
        }

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

document.getElementById('limparProduto').addEventListener('click', function () {
    document.getElementById('formProduto').reset()
    document.getElementById('idProduto').value = ''
    mostrarMensagem('')
})

// ==========================================
// PEDIDOS (RF02, RF08, RF09, RF10, RN01, RN04, RN05, RN06)
// ==========================================
let listaProdutosCache = []

async function carregarDadosPedido() {
    try {
        const clientes = await requisicao('/api/clientes')
        const produtos = await requisicao('/api/produtos')

        listaProdutosCache = produtos

        const campoCliente = document.getElementById('pedidoCliente')
        const campoProduto = document.getElementById('pedidoProduto')

        campoCliente.innerHTML = '<option value="">Selecione um cliente</option>'
        campoProduto.innerHTML = '<option value="">Selecione um produto</option>'

        const listaClientes = Array.isArray(clientes) ? clientes : (clientes.dados || [])

        listaClientes.forEach(function (cliente) {
            campoCliente.innerHTML += `
                <option value="${cliente.id_cliente}">
                    ${escapar(cliente.nome)} (${escapar(cliente.cpf_cnpj)})
                </option>
            `
        })

        produtos.forEach(function (produto) {
            campoProduto.innerHTML += `
                <option value="${produto.id_produto}">
                    ${escapar(produto.nome)} - ${formatarMoeda(produto.preco)} (Estoque: ${produto.estoque})
                </option>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

function atualizarItensPedido() {
    const lista = document.getElementById('itensSelecionados')
    const totalElem = document.getElementById('totalPedidoAtual')
    const alertaMinimo = document.getElementById('alertaPedidoMinimo')

    lista.innerHTML = ''
    let totalAcumulado = 0

    itensPedido.forEach(function (item, indice) {
        const subtotal = item.preco * item.quantidade
        totalAcumulado += subtotal

        lista.innerHTML += `
            <li>
                ${escapar(item.nome)} - ${item.quantidade}x ${formatarMoeda(item.preco)} = <strong>${formatarMoeda(subtotal)}</strong>
                <button type="button" data-remover-item="${indice}">Remover</button>
            </li>
        `
    })

    if (totalElem) {
        totalElem.innerHTML = `<strong>Total do Pedido:</strong> ${formatarMoeda(totalAcumulado)}`
    }

    if (alertaMinimo) {
        if (totalAcumulado >= 50.00) {
            alertaMinimo.style.color = '#059669'
            alertaMinimo.textContent = '✓ Regra de pedido mínimo atendida (R$ 50,00 ou mais)'
        } else {
            alertaMinimo.style.color = '#dc2626'
            alertaMinimo.textContent = `* Faltam ${formatarMoeda(50.00 - totalAcumulado)} para atingir o valor mínimo de R$ 50,00`
        }
    }
}

document.getElementById('adicionarItem').addEventListener('click', async function () {
    const idProduto = document.getElementById('pedidoProduto').value
    const quantidade = Number(document.getElementById('pedidoQuantidade').value)

    if (!idProduto || !Number.isInteger(quantidade) || quantidade <= 0) {
        mostrarMensagem('Selecione um produto e informe uma quantidade inteira válida', true)
        return
    }

    try {
        const produto = listaProdutosCache.find(function (item) {
            return item.id_produto == idProduto
        })

        if (!produto) {
            mostrarMensagem('Produto não encontrado', true)
            return
        }

        const itemExistente = itensPedido.find(function (item) {
            return item.id_produto == idProduto
        })

        const quantidadeTotal = quantidade + (itemExistente ? itemExistente.quantidade : 0)

        // Conforme RN05: quantidade maior que estoque não impede o pedido (venda a descoberto)
        if (quantidadeTotal > produto.estoque) {
            mostrarMensagem(`Aviso: Quantidade (${quantidadeTotal}) superior ao estoque atual (${produto.estoque}). O estoque ficará negativo conforme RN05.`)
        } else {
            mostrarMensagem('Produto adicionado ao pedido')
        }

        if (itemExistente) {
            itemExistente.quantidade = quantidadeTotal
        } else {
            itensPedido.push({
                id_produto: produto.id_produto,
                nome: produto.nome,
                preco: Number(produto.preco),
                quantidade: quantidade
            })
        }

        atualizarItensPedido()

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

document.getElementById('itensSelecionados').addEventListener('click', function (event) {
    const indice = event.target.dataset.removerItem
    if (indice === undefined) return

    itensPedido.splice(Number(indice), 1)
    atualizarItensPedido()
})

document.getElementById('formPedido').addEventListener('submit', async function (event) {
    event.preventDefault()

    const idCliente = document.getElementById('pedidoCliente').value

    if (!idCliente || itensPedido.length === 0) {
        mostrarMensagem('Selecione um cliente e adicione pelo menos um produto', true)
        return
    }

    const totalCalculado = itensPedido.reduce(function (soma, item) {
        return soma + (item.preco * item.quantidade)
    }, 0)

    if (totalCalculado < 50.00) {
        mostrarMensagem('O valor total do pedido não pode ser inferior a R$ 50,00 (RN04)', true)
        return
    }

    const dados = {
        id_cliente: Number(idCliente),
        itens: itensPedido.map(function (item) {
            return {
                id_produto: item.id_produto,
                quantidade: item.quantidade
            }
        })
    }

    try {
        const resultado = await requisicao('/api/pedidos', 'POST', dados)

        mostrarMensagem(
            `Pedido #${resultado.id_pedido} registrado em status [${resultado.status}]. Total: ${formatarMoeda(resultado.valor_total)}`
        )

        itensPedido.length = 0
        atualizarItensPedido()
        this.reset()

        await carregarPedidos()
        await carregarDadosPedido()

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

async function carregarPedidos() {
    try {
        await carregarDadosPedido()

        const pedidos = await requisicao('/api/pedidos')
        const lista = document.getElementById('listaPedidos')
        lista.innerHTML = ''

        pedidos.forEach(function (pedido) {
            // Ações de transição de status (RF09)
            let botaoAvanco = ''
            if (pedido.status === 'rascunho') {
                botaoAvanco = `<button class="btn-status" data-status-pedido="${pedido.id_pedido}" data-proximo-status="confirmado">Confirmar Pedido</button>`
            } else if (pedido.status === 'confirmado') {
                botaoAvanco = `<button class="btn-status" data-status-pedido="${pedido.id_pedido}" data-proximo-status="pago">Registrar Pagamento</button>`
            } else if (pedido.status === 'pago') {
                botaoAvanco = `<button class="btn-status" data-status-pedido="${pedido.id_pedido}" data-proximo-status="entregue">Registrar Entrega</button>`
            }

            // Ação de cancelamento (RF02, RF10, RN01, RN06)
            let botaoCancelar = ''
            const cancelavel = (pedido.status === 'rascunho' || pedido.status === 'confirmado')
            if (ehAdmin && cancelavel) {
                botaoCancelar = `
                    <button class="btn-excluir" data-cancelar-pedido="${pedido.id_pedido}">
                        Cancelar
                    </button>
                `
            }

            lista.innerHTML += `
                <tr>
                    <td>#${pedido.id_pedido}</td>
                    <td>${escapar(pedido.cliente)}</td>
                    <td>${formatarData(pedido.data_pedido)}</td>
                    <td>
                        <span class="status-badge status-${pedido.status}">
                            ${escapar(pedido.status)}
                        </span>
                    </td>
                    <td>${formatarMoeda(pedido.valor_total)}</td>
                    <td>
                        <button data-ver-pedido="${pedido.id_pedido}">Detalhes</button>
                        ${botaoAvanco}
                        ${botaoCancelar}
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

document.getElementById('listaPedidos').addEventListener('click', async function (event) {
    const idVer = event.target.dataset.verPedido
    const idCancelar = event.target.dataset.cancelarPedido
    const idStatus = event.target.dataset.statusPedido
    const proximoStatus = event.target.dataset.proximoStatus

    try {
        if (idVer) {
            const resultado = await requisicao(`/api/pedidos/${idVer}`)
            const pedido = resultado.pedido
            const detalhes = document.getElementById('detalhesPedido')

            let html = `
                <h3>Pedido #${pedido.id_pedido}</h3>
                <p><strong>Cliente:</strong> ${escapar(pedido.cliente)}</p>
                <p><strong>Vendedor:</strong> ${escapar(pedido.usuario)}</p>
                <p><strong>Status:</strong> <span class="status-badge status-${pedido.status}">${escapar(pedido.status)}</span></p>
                <p><strong>Data:</strong> ${formatarData(pedido.data_pedido)}</p>
                <h4>Itens do Pedido:</h4>
                <ul>
            `

            resultado.itens.forEach(function (item) {
                html += `
                    <li>
                        ${escapar(item.produto)} |
                        Qtd: ${item.quantidade} |
                        Unitário: ${formatarMoeda(item.preco_unitario)} |
                        Subtotal: <strong>${formatarMoeda(item.subtotal)}</strong>
                    </li>
                `
            })

            html += `</ul><h3>Total do Pedido: ${formatarMoeda(pedido.valor_total)}</h3>`
            detalhes.innerHTML = html
        }

        if (idStatus && proximoStatus) {
            await requisicao(`/api/pedidos/${idStatus}/status`, 'PUT', { status: proximoStatus })
            mostrarMensagem(`Pedido #${idStatus} atualizado para status '${proximoStatus}' com sucesso!`)
            carregarPedidos()
            carregarDashboard()
        }

        if (idCancelar) {
            if (!ehAdmin) {
                mostrarMensagem('Cancelamento permitido exclusivamente para Administradores (RF02 / RN01)', true)
                return
            }

            if (!confirm('Deseja realmente cancelar este pedido? As quantidades serão estornadas para o estoque.')) {
                return
            }

            await requisicao(`/api/pedidos/${idCancelar}`, 'DELETE')
            mostrarMensagem(`Pedido #${idCancelar} cancelado e estoque estornado com sucesso!`)
            carregarPedidos()
            carregarDashboard()
        }

    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
})

// ==========================================
// INICIALIZAÇÃO
// ==========================================
async function iniciarSistema() {
    try {
        await carregarDashboard()
        await carregarClientes()
        await carregarProdutos()
        await carregarPedidos()
    } catch (erro) {
        mostrarMensagem(erro.message, true)
    }
}

iniciarSistema()
