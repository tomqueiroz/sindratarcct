<?php
/**
 * Plugin Name: SINDRATAR-SP — Convenções Coletivas
 * Description: Shortcode nativo [sindratar_cct]. Homologação, pagamentos bloqueados.
 * Version: 2.1.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

// These constants, if set in wp-config.php, contain PUBLIC values only.
// Never put service_role, bank certificates or Resend credentials here.
add_shortcode('sindratar_cct', function () {
    static $rendered = false;
    if ($rendered) { return '<p>A solicitação de CCT já está nesta página.</p>'; }
    $file = plugin_dir_path(__FILE__) . 'pagina-cct-servico.html';
    if (!is_readable($file)) { return '<p>Formulário temporariamente indisponível.</p>'; }
    $html = file_get_contents($file);
    if (!preg_match('/<!-- CCT_ROOT_START -->(.*?)<!-- CCT_ROOT_END -->/s', $html, $body)
        || !preg_match('/<style id="sindratar-cct-style">(.*?)<\/style>/s', $html, $css)
        || !preg_match('/<script id="sindratar-cct-script">(.*?)<\/script>/s', $html, $js)) {
        return '<p>Pacote do formulário inválido. Consulte a equipe técnica.</p>';
    }
    $url = defined('SINDRATAR_SUPABASE_URL') ? SINDRATAR_SUPABASE_URL : '';
    $key = defined('SINDRATAR_SUPABASE_PUBLIC_KEY') ? SINDRATAR_SUPABASE_PUBLIC_KEY : '';
    if (!is_string($url) || !preg_match('/^https:\/\/[a-z0-9]+\.supabase\.co$/', $url)) { $url = ''; }
    if (!is_string($key)) { $key = ''; }
    // Native markup, never an iframe. Localize the logo to the plugin package.
    $logo = esc_url(plugins_url('assets/slots/brand.header.png', __FILE__));
    $markup = str_replace('src="/assets/slots/brand.header.png"', 'src="' . $logo . '"', $body[1]);
    // The site's own institutional header already supplies its official logo.
    $markup = str_replace('id="sindratar-cct"', 'id="sindratar-cct" class="cct-embedded"', $markup);
    wp_register_style('sindratar-cct', false, array(), '2.1.0');
    wp_enqueue_style('sindratar-cct');
    wp_add_inline_style('sindratar-cct', $css[1]);
    wp_enqueue_style('sindratar-cct-fonts',
        'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap',
        array(), null);
    wp_register_script('sindratar-cct', false, array(), '2.1.0', true);
    wp_enqueue_script('sindratar-cct');
    wp_add_inline_script('sindratar-cct', 'window.SINDRATAR_CCT_CONFIG=' . wp_json_encode(array(
        'supabaseUrl' => $url,
        'supabasePublicKey' => $key,
    ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    wp_add_inline_script('sindratar-cct', $js[1]);
    $rendered = true;
    // Shortcodes render after wp_head in many themes; explicitly flush registered
    // styles so native markup is never delivered unstyled. JS remains in footer.
    ob_start();
    wp_print_styles(array('sindratar-cct', 'sindratar-cct-fonts'));
    $styles = ob_get_clean();
    return $styles . $markup;
});
