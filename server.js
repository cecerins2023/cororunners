require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(__dirname));

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// CONFIGURACIÓN DE MULTER (Memoria)
// ==========================================
// Guardamos la imagen en memoria temporalmente para subirla directo a Supabase
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ENDPOINTS DE LA API
// ==========================================

// Registrar corredor
app.post('/api/register', upload.single('capture'), async (req, res) => {
    try {
        const { nombre, apellido, cedula, telefono, correo, club, talla, referencia } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'La imagen de captura es obligatoria' });
        }

        // Generar código único aleatorio
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const codigo = `CR-${randomStr}`;

        // Subir imagen a Supabase Storage (Bucket 'captures')
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${codigo}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('captures')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Obtener URL pública de la imagen
        const { data: publicUrlData } = supabase.storage
            .from('captures')
            .getPublicUrl(fileName);
        
        const capturePath = publicUrlData.publicUrl;

        // Insertar en la base de datos (Tabla 'runners')
        const { data: runnerData, error: dbError } = await supabase
            .from('runners')
            .insert([
                { codigo, nombre, apellido, cedula, telefono, correo, club, talla, referencia, capturePath }
            ])
            .select();

        if (dbError) throw dbError;
        
        res.json({ success: true, codigo, nombre, apellido });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ error: 'Error procesando el registro en Supabase' });
    }
});

// Obtener corredores para el admin
app.get('/api/runners', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('runners')
            .select('*')
            .order('fechaRegistro', { ascending: false });
            
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        console.error("Error obteniendo corredores:", error);
        res.status(500).json({ error: 'Error obteniendo corredores de Supabase' });
    }
});

// Validar pago y enviar correo
app.post('/api/validate', async (req, res) => {
    try {
        const { id } = req.body;
        
        // Obtener el corredor para sacar su correo
        const { data: runner, error: fetchError } = await supabase
            .from('runners')
            .select('*')
            .eq('id', id)
            .single();
            
        if (fetchError || !runner) return res.status(404).json({ error: 'Corredor no encontrado' });

        // Actualizar el estado del pago a 'Validado'
        const { error: updateError } = await supabase
            .from('runners')
            .update({ estadoPago: 'Validado' })
            .eq('id', id);

        if (updateError) throw updateError;

        // Enviar correo de confirmación
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"Coro Runners 2026" <${process.env.EMAIL_USER}>`,
            to: runner.correo,
            subject: '¡Inscripción Validada Exitosamente!',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; color: #111;">
                    <h2 style="color: #f97316;">¡Felicidades ${runner.nombre}!</h2>
                    <p>Tu pago ha sido validado exitosamente y ya formas parte de Coro Runners 2026.</p>
                    <div style="background: #e5e7eb; padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px;">Tu Código Único de Corredor:</p>
                        <h1 style="color: #0cb4b6; margin: 10px 0;">${runner.codigo}</h1>
                    </div>
                    <p>Presenta este código el día del evento para retirar tu kit.</p>
                </div>
            `
        };

        if(process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptions);
            console.log(`[Backend] Correo enviado exitosamente a: ${runner.correo}`);
        } else {
            console.warn(`[Backend] ADVERTENCIA: Correo NO enviado a ${runner.correo} porque falta configurar EMAIL_USER en el .env`);
        }

        res.json({ success: true, message: 'Pago validado correctamente.' });
    } catch (error) {
        console.error("Error validando:", error);
        res.status(500).json({ error: 'Hubo un error procesando la validación en Supabase' });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 SERVIDOR LISTO Y CONECTADO A SUPABASE (PUERTO ${PORT})`);
    console.log(`====================================================`);
});
