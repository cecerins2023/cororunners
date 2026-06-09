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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(__dirname));

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;
try {
    if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    console.error("Error inicializando Supabase:", e);
}

// ==========================================
// CONFIGURACIÓN DE MULTER (Memoria)
// ==========================================
// Guardamos la imagen en memoria temporalmente para subirla directo a Supabase
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// ENDPOINTS DE LA API
// ==========================================

// Registrar corredor
app.post('/api/register', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({ error: 'Supabase no está configurado. Revisa las variables de entorno en Vercel (SUPABASE_URL y SUPABASE_KEY).' });
        }
        const { nombre, apellido, cedula, edad, genero, telefono, correo, club, talla, referencia, categoria, captureBase64 } = req.body;
        
        if (!captureBase64) {
            return res.status(400).json({ error: 'La imagen de captura es obligatoria' });
        }
        
        if (!categoria) {
            return res.status(400).json({ error: 'Debe seleccionar una categoría de participación' });
        }

        let categoria_edad = 'Sin Categoría';
        if (edad && genero) {
            const e = parseInt(edad);
            if (e >= 16 && e <= 19) categoria_edad = `Juvenil ${genero}`;
            else if (e >= 20 && e <= 29) categoria_edad = `Libre ${genero}`;
            else if (e >= 30 && e <= 39) categoria_edad = `Sub Master ${genero}`;
            else if (e >= 40 && e <= 49) categoria_edad = `Master A ${genero}`;
            else if (e >= 50 && e <= 59) categoria_edad = `Master B ${genero}`;
            else if (e >= 60) categoria_edad = `Master C ${genero}`;
        }

        // Validar cupos por categoría
        const limit = categoria === 'Carrera 10K' ? 100 : (categoria === 'Caminata 5K' ? 200 : 0);
        if (limit === 0) {
            return res.status(400).json({ error: 'Categoría inválida' });
        }

        const { count, error: countError } = await supabase
            .from('runners')
            .select('*', { count: 'exact', head: true })
            .eq('categoria', categoria);

        if (countError) throw countError;

        if (count >= limit) {
            return res.status(400).json({ error: `Lo sentimos, los cupos para la ${categoria} se han agotado. Límite alcanzado (${limit}).` });
        }

        // Generar código único aleatorio
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const codigo = `CR-${randomStr}`;

        // Obtener buffer y mime type desde Base64
        const base64Data = captureBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const mimeMatch = captureBase64.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const fileExt = mimeType.split('/')[1] || 'jpg';

        // Subir imagen a Supabase Storage (Bucket 'captures')
        const fileName = `${Date.now()}-${codigo}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('captures')
            .upload(fileName, buffer, {
                contentType: mimeType,
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
                { codigo, nombre, apellido, cedula, edad, genero, categoria_edad, telefono, correo, club, talla, referencia, capturePath, categoria }
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
        if (!supabase) throw new Error('Supabase no está configurado');
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
        if (!supabase) throw new Error('Supabase no está configurado');
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
app.get('/api/capacities', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ carrera10kFull: false, caminata5kFull: false });
        }
        const { count: count10k, error: err10k } = await supabase
            .from('runners')
            .select('*', { count: 'exact', head: true })
            .eq('categoria', 'Carrera 10K');
            
        const { count: count5k, error: err5k } = await supabase
            .from('runners')
            .select('*', { count: 'exact', head: true })
            .eq('categoria', 'Caminata 5K');

        if (err10k || err5k) throw new Error('Error al obtener contadores');

        res.json({
            carrera10kFull: count10k >= 100,
            caminata5kFull: count5k >= 200
        });
    } catch (error) {
        console.error("Error obteniendo cupos:", error);
        res.status(500).json({ error: 'Error obteniendo cupos' });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 SERVIDOR LISTO Y CONECTADO A SUPABASE (PUERTO ${PORT})`);
    console.log(`====================================================`);
});

module.exports = app;

// Configuración especial para Vercel: desactiva el bodyParser por defecto
// para que Multer pueda leer el 'FormData' (la imagen) sin quedarse colgado.
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
