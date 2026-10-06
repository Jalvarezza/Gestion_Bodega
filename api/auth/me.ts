import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../lib/supabase/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  console.log('USER:', user?.id, '| AUTH ERROR:', error?.message)
  if (error || !user) return res.status(401).json({ error: 'Token inválido' })
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return res.status(403).json({ error: 'Usuario bloqueado' })
  }

  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  console.log('USUARIO DB:', usuario, '| DB ERROR:', errorUsuario?.message, '| CODE:', errorUsuario?.code)
  if (!usuario) return res.status(404).json({ error: 'Usuario no configurado' })

  return res.status(200).json({ rol: usuario.rol, nombre: usuario.nombre, id: user.id })
}
