document.addEventListener('DOMContentLoaded', function() {
    // Animação de scroll suave para links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            if(this.getAttribute('href') !== '#') {
                e.preventDefault();
                document.querySelector(this.getAttribute('href')).scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Animação ao rolar
    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.card-custom, .contact-icon, h2, h5');
        
        elements.forEach((element, index) => {
            const elementPosition = element.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;
            
            if(elementPosition < screenPosition) {
                element.classList.add('animate-fade');
                if(index > 1) {
                    element.classList.add(`delay-${(index % 2) + 1}`);
                }
            }
        });
    };

    // Formulário de contato
    const contactForm = document.getElementById('contactForm');
    if(contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Simulação de envio
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Enviando...';
            
            // Simulação de tempo de envio
            setTimeout(() => {
                submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Enviado!';
                
                // Reset após 3 segundos
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    contactForm.reset();
                }, 3000);
            }, 1500);
        });
    }

    // Verifica na carga inicial e no scroll
    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll();
});