// Never log raw driver messages: they may contain connection strings or credentials.
export function startupDiagnostic(error:unknown){
 const e=error as {code?:unknown;message?:unknown};
 const code=typeof e?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code)?e.code:'UNKNOWN';
 const message=String(e?.message||'');
 const category=/password authentication|SASL|password must/i.test(message)?'database_authentication':/certificate|self.signed|TLS|SSL/i.test(message)?'database_tls':/getaddrinfo|ECONN|timeout|connection/i.test(message)?'database_connectivity':/module|package|import|export/i.test(message)?'deployment_module':/ENOENT|no such file/i.test(message)?'deployment_file':/permission denied|schema|relation|syntax error/i.test(message)?'database_schema':'startup';
 return {event:'backend.initialization.failed',code,category};
}
