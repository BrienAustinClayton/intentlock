export interface OrderDetailPageProps {
  orderId: string;
}

export interface ServerOrderDetailParams {
  id: string;
}

export interface ServerOrderDetailPageProps {
  params: Promise<ServerOrderDetailParams>;
}
