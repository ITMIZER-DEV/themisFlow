-- ==============================================================================
-- setup-vrsoftware-pdv.sql
-- Criação do schema pdv e tabela vendatef (Padrão VRSoftware / VRMaster)
-- para testes locais no container db-dev (porta 5433)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS pdv;

CREATE TABLE IF NOT EXISTS pdv.vendatef (
    id SERIAL PRIMARY KEY,
    id_loja INT NOT NULL DEFAULT 1,
    pdv INT NOT NULL DEFAULT 1,
    cupom INT NOT NULL,
    data DATE NOT NULL,
    hora VARCHAR(8) NOT NULL,
    nsu VARCHAR(30) NOT NULL,
    nsu_host VARCHAR(30),
    autorizacao VARCHAR(30),
    valor NUMERIC(15, 2) NOT NULL,
    bandeira VARCHAR(50) NOT NULL,
    rede VARCHAR(50) NOT NULL,
    tipo VARCHAR(20) NOT NULL,          -- 'CREDITO', 'DEBITO', 'VOUCHER', 'PIX'
    parcelas INT DEFAULT 1,
    taxa NUMERIC(5, 2) DEFAULT 0,
    valor_liquido NUMERIC(15, 2),
    cartao_mascarado VARCHAR(25),
    status VARCHAR(20) DEFAULT 'APROVADO',
    cancelado BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices recomendados para busca por período e loja
CREATE INDEX IF NOT EXISTS idx_vendatef_data ON pdv.vendatef (data);
CREATE INDEX IF NOT EXISTS idx_vendatef_nsu ON pdv.vendatef (nsu);
CREATE INDEX IF NOT EXISTS idx_vendatef_loja_data ON pdv.vendatef (id_loja, data);

-- Limpa dados prévios de teste para evitar duplicidade
TRUNCATE TABLE pdv.vendatef;

-- Inserção de dados de teste (Vendas TEF simulando Supermercado Imperial)
INSERT INTO pdv.vendatef 
    (id_loja, pdv, cupom, data, hora, nsu, nsu_host, autorizacao, valor, bandeira, rede, tipo, parcelas, taxa, valor_liquido, cartao_mascarado, status, cancelado)
VALUES
    -- Dia 2026-06-01 (conforme datas de conciliação do teste)
    (1, 1, 1001, '2026-06-01', '08:14:22', '100234', '98765432', 'AUTH01', 150.00, 'MASTERCARD', 'REDE', 'CREDITO', 1, 2.10, 146.85, '541234******5678', 'APROVADO', false),
    (1, 1, 1002, '2026-06-01', '09:30:11', '100235', '98765433', 'AUTH02',  89.50, 'VISA',       'CIELO', 'DEBITO',  1, 1.20,  88.43, '412345******1234', 'APROVADO', false),
    (1, 2, 2045, '2026-06-01', '10:45:00', '100236', '98765434', 'AUTH03', 320.55, 'ELO',        'REDE', 'CREDITO', 2, 2.50, 312.54, '650485******9012', 'APROVADO', false),
    (1, 2, 2046, '2026-06-01', '11:12:45', '100237', '98765435', 'AUTH04',  45.00, 'PIX',        'STONE', 'PIX',    1, 0.70,  44.69, 'PIX************', 'APROVADO', false),
    (1, 3, 3012, '2026-06-01', '14:20:18', '100238', '98765436', 'AUTH05', 520.00, 'ALELO',      'CIELO', 'VOUCHER', 1, 3.50, 501.80, '606282******3456', 'APROVADO', false),
    
    -- Dia 2026-06-02
    (1, 1, 1050, '2026-06-02', '08:45:10', '100239', '98765437', 'AUTH06',  78.90, 'MASTERCARD', 'REDE', 'DEBITO',  1, 1.20,  77.95, '541234******9988', 'APROVADO', false),
    (1, 2, 2088, '2026-06-02', '11:05:33', '100240', '98765438', 'AUTH07', 415.00, 'VISA',       'STONE', 'CREDITO', 3, 2.80, 403.38, '412345******7766', 'APROVADO', false),
    (1, 3, 3040, '2026-06-02', '16:50:22', '100241', '98765439', 'AUTH08', 210.30, 'TICKET',     'REDE', 'VOUCHER', 1, 3.50, 202.94, '603389******1122', 'APROVADO', false),

    -- Dia 2026-06-03
    (1, 1, 1102, '2026-06-03', '09:12:00', '100242', '98765440', 'AUTH09', 1200.00, 'VISA',      'CIELO', 'CREDITO', 1, 2.10, 1174.80, '412345******4321', 'APROVADO', false),
    (1, 2, 2130, '2026-06-03', '15:40:19', '100243', '98765441', 'AUTH10',   95.00, 'PIX',       'STONE', 'PIX',    1, 0.70,   94.34, 'PIX************', 'APROVADO', false),

    -- Dia 2026-06-05
    (1, 1, 1180, '2026-06-05', '10:00:00', '100244', '98765442', 'AUTH11',   89.90, 'MASTERCARD', 'REDE', 'DEBITO',  1, 1.20,   88.82, '541234******3344', 'APROVADO', false),
    (1, 2, 2210, '2026-06-05', '14:22:15', '100245', '98765443', 'AUTH12',  340.00, 'ELO',        'REDE', 'CREDITO', 2, 2.50,  331.50, '650485******5566', 'APROVADO', false);
