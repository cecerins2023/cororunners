document.addEventListener('DOMContentLoaded', () => {
    // 1. Contador Animado de Corredores Inscritos
    const targetCount = 1245; // Número simulado de corredores
    const countElement = document.getElementById('runners-count');
    let currentCount = 0;
    const duration = 2500; // 2.5 segundos
    const fps = 60;
    const increment = targetCount / (duration / (1000 / fps));

    function updateCounter() {
        currentCount += increment;
        if (currentCount < targetCount) {
            countElement.textContent = Math.floor(currentCount).toLocaleString();
            requestAnimationFrame(updateCounter);
        } else {
            countElement.textContent = targetCount.toLocaleString();
        }
    }
    setTimeout(updateCounter, 500); // Iniciar la animación medio segundo después de cargar

    // 2. Lógica de la Cuenta Regresiva (27 de Julio 2026)
    const eventDate = new Date('July 27, 2026 06:00:00').getTime();
    
    function updateCountdown() {
        const now = new Date().getTime();
        const distance = eventDate - now;

        if (distance < 0) {
            document.getElementById('days').textContent = "00";
            document.getElementById('hours').textContent = "00";
            document.getElementById('minutes').textContent = "00";
            document.getElementById('seconds').textContent = "00";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('days').textContent = days.toString().padStart(2, '0');
        document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
        document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
    }
    
    updateCountdown(); // Ejecutar inmediato
    setInterval(updateCountdown, 1000); // Actualizar cada segundo

    // 3. Lógica del Drag and Drop y File Input para el comprobante
    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('capture');
    const imagePreview = document.getElementById('image-preview');
    const fileMessage = document.querySelector('.file-message');
    const form = document.getElementById('registration-form');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => {
            fileDropArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => {
            fileDropArea.classList.remove('dragover');
        });
    });

    fileDropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecciona una imagen válida.');
            fileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function() {
            imagePreview.src = reader.result;
            imagePreview.classList.remove('hidden');
            fileMessage.style.opacity = '0';
        }
    }

    // 4. Lógica de Envío del Formulario (Conectado al Backend)
    const modal = document.getElementById('success-modal');
    const modalName = document.getElementById('modal-name');
    const modalCode = document.getElementById('modal-code');
    const closeModalBtn = document.getElementById('close-modal-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<span>Procesando inscripción...</span>';
        submitBtn.disabled = true;
        
        // Empaquetar todos los datos e imágenes automáticamente
        const formData = new FormData(form);

        try {
            // Enviar datos al backend real
            const response = await fetch('/api/register', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Mostrar datos reales devueltos por la base de datos
                modalName.textContent = `${result.nombre} ${result.apellido}`;
                modalCode.textContent = result.codigo;
                
                // Mostrar modal emergente
                modal.classList.add('active');
                
                // Resetear formulario
                form.reset();
                imagePreview.classList.add('hidden');
                fileMessage.style.opacity = '1';
            } else {
                alert('Hubo un error al registrar: ' + result.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión con el servidor. Intenta de nuevo.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Cerrar el modal
    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
});
